// S12 review fix: the seam that makes a language change apply LIVE, not
// just persist. `QuickEntryController`/`LogController`/`InsightsController`/
// `PopoverController`/`ReminderController` each pre-format locale-sensitive
// strings INTO their state (the notification title/body, the Log
// empty-state teach line and edit-error messages, the popover teach line
// and away prompt, Insights' weekday/percent labels) — switching
// `useLocale()` in the React layer alone cannot fix text that was already
// baked by a PREVIOUS `refresh()`/`tick()` call under the old locale.
//
// This is the literal function `bootstrap.ts`'s "setLanguage" action calls,
// right after `SettingsController.setLanguage` persists the new choice —
// not a description of what bootstrap.ts does, replicated separately in a
// test. Keeping the actual logic here (rather than inline in `bootstrap.
// ts`'s Tauri event listener) is what makes it directly testable against
// real controllers without a Tauri bridge — see `applyLocale.test.ts`. The
// prior version of this slice had NO such function: bootstrap.ts still
// carried the S4-era placeholder `const LOCALE: Locale = "en"`, so isolated
// unit tests on `resolveLocale` passed while the wiring into any of these
// five controllers did not exist at all.
//
// `panel`/`reminders` need no explicit refresh after `setLocale`:
// `QuickEntryController`'s only locale-baked field (`state.notice`) is
// recomputed fresh on the NEXT `openForSwitch()` call, and
// `ReminderController` pushes no state of its own — its locale is read at
// the next `tick()`'s nudge. `dashboard`/`insights`/`popover` DO cache a
// locale-baked view in their CURRENT state, so each is refreshed here to
// re-push it under the new locale immediately, matching BUILD_SPEC's
// "without restart" acceptance criterion.

import type { Locale } from "../i18n";

export interface LocaleSettable {
  setLocale(locale: Locale): void;
}

export interface LocaleRefreshable extends LocaleSettable {
  refresh(): Promise<void>;
}

export interface LiveLocaleTargets {
  panel: LocaleSettable;
  dashboard: LocaleRefreshable;
  insights: LocaleRefreshable;
  popover: LocaleRefreshable;
  reminders: LocaleSettable;
  /** S13a: the native tray menu and tooltip, which live in Rust and cannot
   * call `t()` themselves — `src/tray/tauriTrayLabelDriver.ts` resolves the
   * `tray.*` keys here in TS and pushes the strings over the
   * `set_tray_labels` command. A plain function rather than a controller
   * because there is no TS-side state to keep: the OS owns the menu.
   *
   * REQUIRED, not optional, on purpose. The tray was untranslated for
   * twelve slices precisely because nothing forced anyone to wire it; a
   * required field means `tsc` fails if a future caller of this seam
   * forgets, which is the same lesson S12's own review left behind — a test
   * that a translation exists is not a test that anything reaches it. */
  tray: (locale: Locale) => void | Promise<void>;
}

/** Applies `locale` to every locale-aware controller and refreshes the ones
 * whose current state holds locale-baked text, so a language change is
 * visible immediately on every open window — not just on the next natural
 * refresh. */
export async function applyLocaleLive(locale: Locale, targets: LiveLocaleTargets): Promise<void> {
  targets.panel.setLocale(locale);
  targets.dashboard.setLocale(locale);
  targets.insights.setLocale(locale);
  targets.popover.setLocale(locale);
  targets.reminders.setLocale(locale);

  await Promise.all([
    targets.dashboard.refresh(),
    targets.insights.refresh(),
    targets.popover.refresh(),
    targets.tray(locale),
  ]);
}
