// S13a: pushes the resolved tray strings to Rust, which owns the native
// tray menu and tooltip.
//
// The decision of WHICH strings (i.e. the catalogs and the locale) stays in
// TS — `trayLabels.ts`, unit-tested — and Rust only applies whatever it is
// handed, the same "Rust stays thin: plumbing + OS integration" split as
// `set_tray_state`. `applyLocale.ts` calls this on every language change,
// and `bootstrap.ts` calls it once at boot so a session that starts in
// Spanish gets a Spanish menu without the user touching anything.
//
// No unit test: `invoke` is Tauri's IPC bridge, which doesn't exist under
// Vitest/jsdom (same reasoning as `tauriSqlDriver.ts` /
// `tauriAutostartDriver.ts` — stubbing the bridge would only prove the
// stub). The strings it sends are pinned by `trayLabels.test.ts`; that the
// menu actually redraws in the new language is an OS-level behaviour, so it
// is one of the S14 manual checks.

import { invoke } from "@tauri-apps/api/core";
import type { Locale } from "../i18n";
import { trayLabels } from "./trayLabels";

/** Sends `locale`'s tray strings to the Rust side. Failures are swallowed
 *  deliberately: a tray label that could not be updated must never take down
 *  a language change that has already applied to every other surface. */
export async function pushTrayLabels(locale: Locale): Promise<void> {
  try {
    await invoke("set_tray_labels", { labels: trayLabels(locale) });
  } catch {
    // Nothing actionable for the user here — the menu keeps its previous
    // wording until the next language change or restart.
  }
}
