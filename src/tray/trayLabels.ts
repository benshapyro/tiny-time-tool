// S13a: the pure locale -> tray-strings mapping.
//
// The native tray menu and tooltip are built in Rust at startup
// (`src-tauri/src/tray.rs`), before the webview's JS runtime is guaranteed to
// exist, so that code cannot call `t()` — which is why the five `tray.*` keys
// sat fully translated in both catalogs for twelve slices while the menu
// itself was English string literals. S12 shipped the language setting and
// made that reachable: a Spanish app with an English tray menu.
//
// The fix keeps the split this project uses everywhere else. The catalogs
// stay the single source of truth in TS; Rust keeps only an English default
// for the instant before the webview boots, and is handed the resolved
// strings over the `set_tray_labels` command
// (`tauriTrayLabelDriver.ts` -> `lib.rs`). No Spanish is duplicated into
// Rust, and nothing here knows about Tauri — this file is pure, so
// `trayLabels.test.ts` can pin the actual strings without a native harness.

import type { Locale } from "../i18n";
import { t } from "../i18n";

export interface TrayLabels {
  openDashboard: string;
  quit: string;
  tooltipIdle: string;
  tooltipRunning: string;
  tooltipPaused: string;
}

/** Every user-visible string the native tray shows, in `locale`. */
export function trayLabels(locale: Locale): TrayLabels {
  return {
    openDashboard: t(locale, "tray.openDashboard"),
    quit: t(locale, "tray.quit"),
    tooltipIdle: t(locale, "tray.tooltip.idle"),
    tooltipRunning: t(locale, "tray.tooltip.running"),
    tooltipPaused: t(locale, "tray.tooltip.paused"),
  };
}
