// Real runtime wiring for the app's "main" window (BUILD_SPEC S4: "a later
// slice that wires a ShortcutController into the running app" — this is
// that slice). Constructs the production TimerEngine + ShortcutController +
// QuickEntryController + (S5) PopoverController against the real Tauri
// plugins (SQLite, global-shortcut) and connects S3's seams to S4's panel
// window and S5's popover window:
//   - `onPanelOpenRequested` (fires exactly on primary-from-idle): opens the
//     panel for naming, then shows and focuses the "panel" window declared
//     in `src-tauri/tauri.conf.json`. This is the mechanism the S4 spike
//     proved (docs/build-log.md): `show()` + `setFocus()` on an
//     `alwaysOnTop`/`decorations:false` window reliably steals keyboard
//     focus on macOS even when a third-party app was frontmost.
//   - `onBeforePause`: commits whatever's typed if the panel is open, before
//     the pause takes effect ("primary press while the panel is open =
//     commit current text (as Enter) then pause").
//   - `onTrayStateChange`: forwarded to the Rust `set_tray_state` command so
//     the tray icon/title stay in sync with pause/resume/stop, per the
//     2026-08-22 amendment ("pause must be visible, not modal") — and (S5)
//     also refreshes the popover's view, so it stays correct even if it
//     wasn't open when the state changed (e.g. a shortcut press while the
//     popover is closed). (S6) also refreshes the Dashboard's Log tab
//     (`LogController`, below), for the same reason — see its own module
//     doc comment on the cross-module obligation this creates.
//
// The "panel" and "popover" windows are SEPARATE webview/JS contexts (no
// shared memory with "main"), so `QuickEntryController`/`PopoverController`
// state reaches them only over Tauri's cross-window event bus
// (`panelEvents.ts` / `popoverEvents.ts`) — never a shared JS object. The
// Dashboard's Log tab (S6, `LogController`/`logEvents.ts`) happens to
// render in this SAME "main" window, but is wired the identical way on
// purpose — one consistent pattern for "a controller talks to a live
// window," not a special case for the one surface that could technically
// skip the event bus. `core:event:default` (listen/emit) is already part
// of `core:default`, already granted to every window in
// `src-tauri/capabilities/default.json`.
//
// No unit test for the IPC glue itself (same reasoning as
// `tauriSqlDriver.ts` / `tauriShortcutDriver.ts` — stubbing Tauri's bridge
// would only prove the stub). The business logic this wires together
// (`ShortcutController`, `QuickEntryController`, `PopoverController`,
// `LogController`) is exercised in `panelWiring.test.ts` /
// `popoverController.test.ts` / `logController.test.ts` against fakes/real
// fixture DBs; this file's real behaviour is exercised live, at the S14
// manual-check gate and the S4 spike.
//
// Runs exactly once, and only from the "main" window — the "panel"/
// "popover" windows' own scripts must never call this (it would
// double-register the global shortcuts against the same OS-level
// accelerators).

import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AwayGapController } from "../away/awayGapController";
import { ExportController } from "../export/exportController";
import { EXPORT_ACTION_EVENT, EXPORT_STATE_EVENT } from "../export/exportEvents";
import type { ExportActionPayload } from "../export/exportEvents";
import type { Locale } from "../i18n";
import { LOG_ACTION_EVENT, LOG_EDIT_ACTION_EVENT, LOG_STATE_EVENT } from "../log/logEvents";
import type { LogActionPayload, LogEditActionPayload } from "../log/logEvents";
import { LogController } from "../log/logController";
import { PANEL_COMMIT_EVENT, PANEL_INPUT_EVENT, PANEL_STATE_EVENT } from "../panel/panelEvents";
import type { PanelCommitPayload, PanelInputPayload } from "../panel/panelEvents";
import { QuickEntryController } from "../panel/quickEntryController";
import { POPOVER_ACTION_EVENT, POPOVER_STATE_EVENT } from "../popover/popoverEvents";
import type { PopoverActionPayload } from "../popover/popoverEvents";
import { PopoverController } from "../popover/popoverController";
import { DEFAULT_ACCELERATORS, ShortcutController } from "../shortcuts/shortcutController";
import { createTauriShortcutDriver } from "../shortcuts/tauriShortcutDriver";
import { consumeFirstLaunch } from "./firstLaunchFlag";
import { ReminderController } from "../reminders/reminderController";
import { getReminderMinutes } from "../reminders/reminderSettings";
import { createTauriNotificationDriver } from "../reminders/tauriNotificationDriver";
import { createTauriSqlDriver } from "../timer/tauriSqlDriver";
import { TimerEngine } from "../timer/timerEngine";

// S4 placeholder, same convention as App.tsx: language comes from Settings
// (`language`) and OS detection once S12 lands. Default "en" until then.
const LOCALE: Locale = "en";

// S5: mirrors `TRAY_CLICKED_EVENT` in `src-tauri/src/tray.rs` — Rust only
// emits this on a tray-icon left-click; deciding what it means
// (`togglePopover`, below) is TS business logic, per the "Rust stays thin"
// rule. Kept as a literal, not imported, since the two sides can't share a
// module across the Rust/TS boundary — same convention as `set_tray_state`.
const TRAY_CLICKED_EVENT = "tray:clicked";

export interface Bootstrapped {
  shortcuts: ShortcutController;
  panel: QuickEntryController;
  popover: PopoverController;
  dashboard: LogController;
  exports: ExportController;
  reminders: ReminderController;
  awayGap: AwayGapController;
}

let bootstrapped: Promise<Bootstrapped> | null = null;

/** Idempotent: a second call returns the same in-flight/settled promise
 * rather than double-registering shortcuts (React StrictMode double-invokes
 * effects in dev). */
export function bootstrap(): Promise<Bootstrapped> {
  if (!bootstrapped) {
    bootstrapped = run();
  }
  return bootstrapped;
}

async function run(): Promise<Bootstrapped> {
  const sqlDriver = await createTauriSqlDriver();
  const engine = await TimerEngine.create(sqlDriver);
  const shortcutDriver = createTauriShortcutDriver();

  const panel = new QuickEntryController({
    engine,
    locale: LOCALE,
    onStateChange: (state) => {
      void emit(PANEL_STATE_EVENT, state);
    },
  });

  // S6: the Log tab observes mutations any OTHER surface makes to the
  // shared engine while the Dashboard is open. Same cross-module lesson
  // S5's review left behind: "ask what else must observe that change."
  // `dashboard.refresh()` is wired into every seam below that already
  // exists to keep the tray/popover in sync.
  //
  // S7 adds the reverse direction: the Log tab now mutates the engine too
  // (rename/tag/time edits, delete, undo), so it needs its OWN seam back
  // out to every other surface — `onEngineMutated`, fired after every edit
  // that actually changed something. Wired to `popover.refresh()`, which
  // already re-syncs the tray via its own `onTrayStateChange` (below) —
  // same one-call-covers-both trick `PANEL_COMMIT_EVENT`'s handler already
  // uses further down. The quick-entry panel is deliberately NOT wired
  // here: its only state is an in-progress, uncommitted text buffer for
  // whatever entry is being named right now, never a read of historical
  // data, so a Log edit has nothing in it to invalidate — see
  // `logController.ts`'s module doc comment for the full reasoning.
  const dashboard = new LogController({
    engine,
    locale: LOCALE,
    primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    onStateChange: (state) => {
      void emit(LOG_STATE_EVENT, state);
    },
    onEngineMutated: () => popover.refresh(),
  });

  // S10: exports. Unlike `dashboard`/`popover` above, this controller keeps
  // no day-scoped cached view of engine data between actions — every action
  // (`copyTodayForAi`/`exportCsv`/`exportJson`) re-queries the engine fresh
  // when invoked — so it needs no `onEngineMutated` seam into the
  // cross-module refresh graph above: there is nothing in it that could go
  // stale.
  const exports = new ExportController({
    engine,
    onStateChange: (state) => {
      void emit(EXPORT_STATE_EVENT, state);
    },
  });

  // S9: away-gap recovery. Persists a heartbeat to the same `settings`
  // table every 30s while running (the interval below, shared with S8's
  // reminder tick) and checks the gap once more at launch (further down).
  // `onEngineMutated` is the ONE channel through which a trim/keep reaches
  // every other surface when it fires from the periodic tick rather than
  // from a popover click — `popover.refresh()` already cascades to the
  // tray (via its own onTrayStateChange, wired below) and to the Log tab
  // (via the tray-sync callback's `dashboard.refresh()` call), same
  // one-call-covers-everything pattern `dashboard`'s own onEngineMutated
  // uses above.
  // Explicit type annotations on `awayGap`/`popover` below are load-bearing,
  // not stylistic: each one's initializer references the OTHER by value
  // (`awayGap`'s `onEngineMutated` calls `popover.refresh()`; `popover`'s
  // options include `awayGap` itself), which is a genuine mutual reference
  // TS cannot infer through (unlike `dashboard`'s one-directional reference
  // to `popover` above, which infers fine) — without annotations, both
  // resolve to an implicit "any that depends on itself" compile error.
  const awayGap: AwayGapController = new AwayGapController({
    engine,
    driver: sqlDriver,
    onEngineMutated: () => popover.refresh(),
  });

  const popover: PopoverController = new PopoverController({
    engine,
    locale: LOCALE,
    primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    onSwitch: () => switchAction(),
    awayGap,
    onStateChange: (state) => {
      void emit(POPOVER_STATE_EVENT, state);
    },
    // Review finding on S5: the shortcut path synced the tray but the
    // popover path did not, so Start-from-popover left the tray on Idle and
    // Stop-from-popover left it ticking. Same command, both directions.
    // S6 extends the same fix to the Log tab: a popover action must reach
    // it too, or the Dashboard would show stale state while open.
    onTrayStateChange: (state, elapsedSeconds) => {
      void invoke("set_tray_state", { state, elapsedSeconds });
      void dashboard.refresh();
    },
  });

  const shortcuts = new ShortcutController({
    driver: shortcutDriver,
    engine,
    onPanelOpenRequested: () => {
      panel.openForNaming();
      void showPanel();
    },
    onBeforePause: () => panel.commitIfOpen(),
    onTrayStateChange: (state, elapsedSeconds) => {
      void invoke("set_tray_state", { state, elapsedSeconds });
      void popover.refresh();
      void dashboard.refresh();
    },
  });
  await shortcuts.registerAll();

  // The panel window relays what the user typed/committed over the event
  // bus — see panelEvents.ts for why this isn't a shared JS call.
  await listen<PanelInputPayload>(PANEL_INPUT_EVENT, (event) => {
    panel.updateText(event.payload.text);
  });
  await listen<PanelCommitPayload>(PANEL_COMMIT_EVENT, (event) => {
    panel.updateText(event.payload.text);
    // S6: a commit here can rename the current entry (naming flow) or stop
    // one and start another (switching flow) — either changes what the Log
    // tab should show, so it needs telling even though it caused neither.
    // A commit changes timer state, so EVERY observer needs telling — not
    // just the Log. Before this, a switch-commit (stop old, start new) left
    // the tray icon and the popover showing the previous entry until their
    // next unrelated refresh. That gap predates S6; it is the same shape as
    // the S5 review finding where popover actions never reached the tray,
    // and it is fixed here rather than left for a slice that does not own it.
    //
    // `popover.refresh()` fires the popover's own onTrayStateChange, which
    // is what actually re-syncs the tray, so the tray is covered by the same
    // call rather than by a second invoke that could drift out of step.
    // `.finally`, not `.then`: commit() does stop() then start() as separate
    // un-transacted steps, so a failure after stop() already mutated the
    // engine would leave every surface showing the just-stopped entry — the
    // same stale-surface bug, reached through a rejection instead of a
    // missing call. Review finding on S6.
    void panel
      .commit()
      .finally(() => Promise.all([dashboard.refresh(), popover.refresh()]))
      .catch(() => {
        // Refresh failures must not become unhandled rejections; the surfaces
        // simply stay as they were until the next event.
      });
  });

  // The popover window relays button clicks the same way — see
  // popoverEvents.ts. Each action refreshes and re-pushes state via the
  // controller's own onStateChange, already wired above.
  await listen<PopoverActionPayload>(POPOVER_ACTION_EVENT, (event) => {
    switch (event.payload.action) {
      case "start":
        void popover.start();
        return;
      case "pause":
        void popover.pause();
        return;
      case "resume":
        void popover.resume();
        return;
      case "stop":
        void popover.stop();
        return;
      case "switch":
        void popover.switchTask().then(() => hidePopover());
        return;
      case "awayKeep":
        void popover.awayKeep().catch(() => {
          // A rejected Keep must not become an unhandled rejection, and must
          // not leave the banner stranded — the controller drops a stale
          // prompt itself, so a refresh is enough to resync the surface.
          void popover.refresh();
        });
        return;
      case "awayDiscard":
        void Promise.resolve(popover.awayDiscard()).catch(() => {
          void popover.refresh();
        });
        return;
      default: {
        const exhaustive: never = event.payload.action;
        return exhaustive;
      }
    }
  });

  // The Dashboard's Log tab relays date-nav clicks the same way — see
  // logEvents.ts. Each action refreshes and re-pushes state via the
  // controller's own onStateChange, already wired above.
  await listen<LogActionPayload>(LOG_ACTION_EVENT, (event) => {
    switch (event.payload.action) {
      case "today":
        void dashboard.goToday();
        return;
      case "previous":
        void dashboard.goToPreviousDay();
        return;
      case "next":
        void dashboard.goToNextDay();
        return;
      default: {
        const exhaustive: never = event.payload.action;
        return exhaustive;
      }
    }
  });

  // S7: the Log tab's edit/delete/undo actions relay the same way — see
  // logEvents.ts. Each mutating action refreshes and re-pushes state via
  // the controller's own onStateChange (already wired above), and — when
  // it actually mutated anything — fires onEngineMutated to reach the
  // other surfaces (also wired above).
  await listen<LogEditActionPayload>(LOG_EDIT_ACTION_EVENT, (event) => {
    const { action } = event.payload;
    switch (action.type) {
      case "beginEdit":
        dashboard.beginEdit(action.entryId);
        return;
      case "cancelEdit":
        dashboard.cancelEdit();
        return;
      case "saveEdit":
        void dashboard.saveEdit(action.entryId, {
          name: action.name,
          client: action.client,
          project: action.project,
          start: action.start,
          end: action.end,
        });
        return;
      case "delete":
        void dashboard.deleteEntry(action.entryId).catch(() => {
          // Defense-in-depth guard (e.g. CannotDeleteRunningEntryError) —
          // the Log UI already disables Delete for the running entry, so
          // this path shouldn't be reachable live; swallow rather than
          // crash the window on an unexpected click.
        });
        return;
      case "undoDelete":
        void dashboard.undoDelete();
        return;
      case "dismissUndo":
        dashboard.dismissUndo();
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  });

  // S10: the Dashboard's Export section relays clicks the same way — see
  // exportEvents.ts. Each action re-pushes state via the controller's own
  // onStateChange (already wired above); `copyForAi`/`exportCsv`/
  // `exportJson` never throw (their own error paths set a designed state
  // field instead — see `exportController.ts`), so there is nothing here to
  // catch.
  await listen<ExportActionPayload>(EXPORT_ACTION_EVENT, (event) => {
    const { action } = event.payload;
    switch (action.type) {
      case "copyForAi":
        void exports.copyTodayForAi();
        return;
      case "setRangeStart":
        exports.setRangeStart(action.value);
        return;
      case "setRangeEnd":
        exports.setRangeEnd(action.value);
        return;
      case "exportCsv":
        void exports.exportCsv();
        return;
      case "exportJson":
        void exports.exportJson();
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  });

  // Rust's tray icon click handler (tray.rs) only emits — deciding what a
  // click means (open vs. close, refreshing first) is business logic and
  // stays here, per this project's "Rust stays thin" rule.
  await listen(TRAY_CLICKED_EVENT, () => {
    void togglePopover();
  });

  // S8: reminders. Persisted `reminder.minutes` is read once at boot (S12
  // will add live Settings UI on top of the same `reminderSettings.ts`
  // seam this reads/writes — see that module's doc comment). Clicking a
  // nudge opens the popover via the same `showPopover()` seam the tray
  // icon and first-launch auto-open already use below — reminders don't
  // duplicate that behaviour, they trigger it.
  const reminderMinutes = await getReminderMinutes(sqlDriver);
  const reminders = new ReminderController({
    engine,
    driver: createTauriNotificationDriver(),
    locale: LOCALE,
    minutes: reminderMinutes,
    onOpenPopover: () => showPopover(),
  });
  await reminders.registerClickHandler();
  // Polled, not event-driven: nothing in TimerEngine emits on the passage
  // of time. 30s matches the cadence BUILD_SPEC anticipates for S9's
  // away-gap heartbeat — frequent enough that a 15m custom interval still
  // nudges within 30s of its true boundary, cheap enough to run forever in
  // a tray app. See `reminderController.ts`'s module doc comment for why
  // firing this many times near a boundary still yields exactly one nudge.
  // S9's `awayGap.check()` shares this exact tick (BUILD_SPEC: "the gap
  // check runs on every heartbeat tick") — one 30s ticker driving both,
  // not two independent timers that could drift.
  setInterval(() => {
    void reminders.tick();
    void awayGap.check();
  }, 30_000);

  // BUILD_SPEC S9: "the gap check runs ... once at app launch" — the exact
  // same `check()` the 30s ticker above calls, run once here so a kill -9
  // while running is caught the moment the app comes back, not up to 30s
  // later. Must run before the refreshes below so their FIRST paint
  // already reflects any trim/prompt, not a stale pre-check view.
  await awayGap.check();

  await popover.refresh();
  await dashboard.refresh();
  // S10: pushes the Export section's initial state (today's date range) to
  // the "main" window the same way `dashboard.refresh()` above does for the
  // Log tab — `exports`'s constructor already computed it; this just emits
  // it, since ExportController has no async `refresh()` of its own (see the
  // "no cached view" comment on its construction above).
  void emit(EXPORT_STATE_EVENT, exports.state);

  // BUILD_SPEC S5: "On first launch the popover auto-opens once" —
  // persisted so a real restart never re-fires it (firstLaunchFlag.ts).
  if (await consumeFirstLaunch(sqlDriver)) {
    void showPopover();
  }

  return { shortcuts, panel, popover, dashboard, exports, reminders, awayGap };
}

/** The Switch action (popover/reminder, wired by later slices): opens the
 * panel showing the passive "Will stop: ..." notice, then summons the
 * window the same way the primary shortcut does. */
export async function switchAction(): Promise<void> {
  const { panel } = await bootstrap();
  await panel.openForSwitch();
  await showPanel();
}

/** Shows and focuses the quick-entry panel window. Exported so the Switch
 * action above and later slices reuse the exact same summon path. */
export async function showPanel(): Promise<void> {
  const win = await WebviewWindow.getByLabel("panel");
  if (!win) return;
  await win.show();
  await win.setFocus();
}

/** S5: shows and focuses the tray popover window. Real anchoring to the
 * tray icon's position is the S14 manual check (BUILD_SPEC S5 row) — this
 * summons the window declared in `src-tauri/tauri.conf.json` the same way
 * `showPanel` summons the quick-entry panel. Called by the tray icon's
 * click handler (Rust, `tray.rs`) and by the first-launch auto-open. */
export async function showPopover(): Promise<void> {
  const { popover } = await bootstrap();
  await popover.refresh();
  const win = await WebviewWindow.getByLabel("popover");
  if (!win) return;
  await win.show();
  await win.setFocus();
}

/** S5: hides the tray popover window — the target of Esc/click-away
 * (`PopoverContainer.tsx`) and of a completed Switch action. */
export async function hidePopover(): Promise<void> {
  const win = await WebviewWindow.getByLabel("popover");
  if (!win) return;
  await win.hide();
}

/** S5: toggles the tray popover — the tray icon's own click handler wants
 * "open if closed, close if open" rather than always-open. */
export async function togglePopover(): Promise<void> {
  const win = await WebviewWindow.getByLabel("popover");
  if (!win) return;
  if (await win.isVisible()) {
    await win.hide();
  } else {
    await showPopover();
  }
}
