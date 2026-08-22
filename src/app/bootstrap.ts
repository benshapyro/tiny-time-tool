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
import type { Locale } from "../i18n";
import { LOG_ACTION_EVENT, LOG_STATE_EVENT } from "../log/logEvents";
import type { LogActionPayload } from "../log/logEvents";
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

  // S6: the Log tab is read-only (no start/pause/stop/rename methods of its
  // own — full editing lands in S7) but it must still observe mutations
  // any OTHER surface makes to the shared engine while the Dashboard is
  // open. Same cross-module lesson S5's review left behind: "ask what else
  // must observe that change." `dashboard.refresh()` is wired into every
  // seam below that already exists to keep the tray/popover in sync.
  const dashboard = new LogController({
    engine,
    locale: LOCALE,
    primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    onStateChange: (state) => {
      void emit(LOG_STATE_EVENT, state);
    },
  });

  const popover = new PopoverController({
    engine,
    locale: LOCALE,
    primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    onSwitch: () => switchAction(),
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

  // Rust's tray icon click handler (tray.rs) only emits — deciding what a
  // click means (open vs. close, refreshing first) is business logic and
  // stays here, per this project's "Rust stays thin" rule.
  await listen(TRAY_CLICKED_EVENT, () => {
    void togglePopover();
  });

  await popover.refresh();
  await dashboard.refresh();

  // BUILD_SPEC S5: "On first launch the popover auto-opens once" —
  // persisted so a real restart never re-fires it (firstLaunchFlag.ts).
  if (await consumeFirstLaunch(sqlDriver)) {
    void showPopover();
  }

  return { shortcuts, panel, popover, dashboard };
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
