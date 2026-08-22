// S12: resolves the persisted `language` setting ("system" | "en" | "es")
// to the actual `Locale` every rendering surface needs. Kept as a pure,
// standalone function — no SqlDriver, no Tauri — so the "system" branch is
// unit-testable against arbitrary `navigator.language`-shaped strings
// without a real OS or a real database.
//
// This is the ONE place the OS-locale heuristic lives; every window applies
// it identically via `LiveSettingsProvider.tsx`; no container hardcodes its
// own "en" fallback anymore (that was the S1-S11 placeholder convention —
// this slice is what removes it).

import type { Locale } from "../i18n";
import type { LanguageSetting } from "./languageSetting";

/** `setting` is the persisted user choice; `systemLocale` is whatever the
 * runtime's own locale probe reports (`detectSystemLocale`, or a test
 * fixture string). Only the language subtag is examined ("es-MX" resolves
 * the same as "es"), matching how BUILD_SPEC's own locale-aware formatters
 * (`src/i18n/index.ts`) treat "es" as one family rather than per-country. */
export function resolveLocale(setting: LanguageSetting, systemLocale: string): Locale {
  if (setting === "en" || setting === "es") return setting;
  return systemLocale.toLowerCase().startsWith("es") ? "es" : "en";
}

/** The runtime's own locale probe. `navigator.language` is available in
 * every Tauri webview (it's a real browser engine) with no extra plugin —
 * unlike a genuine "OS locale" API, this reflects the webview's configured
 * language, which is the same signal every browser-based i18n heuristic
 * uses and requires no new dependency. Falls back to "en" where `navigator`
 * doesn't exist (e.g. this file imported under a non-DOM test context). */
export function detectSystemLocale(): string {
  if (typeof navigator === "undefined" || !navigator.language) return "en";
  return navigator.language;
}
