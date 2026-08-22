// Real runtime wiring for the app's "main" window (BUILD_SPEC S4: "a later
// slice that wires a ShortcutController into the running app" — this is
// that slice). Constructs the production TimerEngine + ShortcutController +
// QuickEntryController against the real Tauri plugins (SQLite,
// global-shortcut) and connects S3's seams to S4's panel window:
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
//     2026-08-22 amendment ("pause must be visible, not modal").
//
// The "panel" window is a SEPARATE webview/JS context (no shared memory
// with "main"), so `QuickEntryController`'s state reaches it only over
// Tauri's cross-window event bus (`panelEvents.ts`) — never a shared JS
// object. `core:event:default` (listen/emit) is already part of
// `core:default`, already granted to both windows in
// `src-tauri/capabilities/default.json`.
//
// No unit test for the IPC glue itself (same reasoning as
// `tauriSqlDriver.ts` / `tauriShortcutDriver.ts` — stubbing Tauri's bridge
// would only prove the stub). The business logic this wires together
// (`ShortcutController`, `QuickEntryController`) is exercised in
// `panelWiring.test.ts` against fakes; this file's real behaviour is
// exercised live, at the S14 manual-check gate and the S4 spike.
//
// Runs exactly once, and only from the "main" window — the "panel" window's
// own script must never call this (it would double-register the global
// shortcuts against the same OS-level accelerators).

import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Locale } from "../i18n";
import { PANEL_COMMIT_EVENT, PANEL_INPUT_EVENT, PANEL_STATE_EVENT } from "../panel/panelEvents";
import type { PanelCommitPayload, PanelInputPayload } from "../panel/panelEvents";
import { QuickEntryController } from "../panel/quickEntryController";
import { ShortcutController } from "../shortcuts/shortcutController";
import { createTauriShortcutDriver } from "../shortcuts/tauriShortcutDriver";
import { createTauriSqlDriver } from "../timer/tauriSqlDriver";
import { TimerEngine } from "../timer/timerEngine";

// S4 placeholder, same convention as App.tsx: language comes from Settings
// (`language`) and OS detection once S12 lands. Default "en" until then.
const LOCALE: Locale = "en";

export interface Bootstrapped {
  shortcuts: ShortcutController;
  panel: QuickEntryController;
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
    void panel.commit();
  });

  return { shortcuts, panel };
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
