// S12: the live-locale seam every window's container reads instead of a
// hardcoded `const LOCALE: Locale = "en"` (the S1-S11 placeholder
// convention every *Container.tsx carried, each with a comment saying
// "language comes from Settings once S12 lands" — this is that slice).
//
// The context itself lives here, separate from `LiveSettingsProvider.tsx`
// (which actually listens for changes and updates it), purely so this tiny,
// dependency-free module can be imported by every container without also
// pulling in `@tauri-apps/api/event`.

import { createContext, useContext } from "react";
import type { Locale } from "../i18n";

/** Default "en" matches every container's previous hardcoded placeholder —
 * the brief window before `LiveSettingsProvider` receives its first
 * `settings:state` push (or in a test that renders a container without
 * wrapping it in the provider at all) falls back to exactly what shipped
 * before this slice, never a blank/undefined locale. */
export const LocaleContext = createContext<Locale>("en");

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
