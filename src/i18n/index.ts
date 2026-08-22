import { en, type TranslationKey } from "./en";
import { es } from "./es";

export type { TranslationKey } from "./en";
export type Locale = "en" | "es";

const catalogs: Record<Locale, Record<TranslationKey, string>> = { en, es };

/** Look up a translation key in the given locale. Every key/locale pair is
 * statically guaranteed to exist (see es.ts), so this never falls back. */
export function t(locale: Locale, key: TranslationKey): string {
  return catalogs[locale][key];
}

/** S4: substitutes `{placeholder}` tokens in a translated string (e.g. the
 * quick-entry panel's switch notice, "Will stop: {name} ({elapsed})") —
 * this project's catalogs have no interpolation of their own, so this is a
 * small, generic helper rather than one-off string concatenation at every
 * call site. A placeholder with no matching key is left untouched (never
 * throws) — a missing param is a caller bug to notice in review, not a
 * runtime crash in a live shortcut handler. */
export function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? params[key]! : match,
  );
}

// Locale-aware short-date formatter, pinned by BUILD_SPEC for the null-name
// auto-name display: en "MMM d" (e.g. "Aug 21"), es "d MMM" (e.g. "21 ago").
const shortDateFormatters: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
  es: new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }),
};

export function formatShortDate(locale: Locale, date: Date): string {
  return shortDateFormatters[locale].format(date);
}

// S6: the Log tab's date-nav header, for a day other than "today" —
// deliberately more detail than the short-date auto-name format above
// (full weekday + year), since the Log lets someone browse arbitrarily far
// into the past where "Aug 20" alone would be ambiguous across years.
// Reuses Intl's own per-locale idiom (e.g. the "de" joining day/month/year
// in es-ES) rather than hand-building a template — same reasoning as every
// other formatter in this file.
const longDateFormatters: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  es: new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
};

export function formatLongDate(locale: Locale, date: Date): string {
  return longDateFormatters[locale].format(date);
}

// Display-surface time formatter (BUILD_SPEC "Auto-name display format",
// amended 2026-08-22): times on display surfaces follow the user's OS
// locale convention — en-US is 12-hour with AM/PM, locales that
// conventionally use 24-hour (incl. es-ES) stay 24-hour. This relies on
// Intl's own per-locale default hour cycle rather than hardcoding either,
// so it stays correct if more locales are added later. Data exports do
// NOT use this — see `formatFixedTime` below.
const displayTimeFormatters: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }),
  es: new Intl.DateTimeFormat("es-ES", { hour: "numeric", minute: "2-digit" }),
};

export function formatDisplayTime(locale: Locale, date: Date): string {
  return displayTimeFormatters[locale].format(date);
}

// Fixed-format time formatter reserved for data exports (CSV/JSON,
// Copy-for-AI table): always 24-hour `HH:mm`, independent of the viewer's
// locale — "display follows the human, data stays machine-stable"
// (BUILD_SPEC, 2026-08-22). `hourCycle: "h23"` forces 24-hour regardless of
// locale; the locale itself is pinned to "en-US" only to guarantee ASCII
// digits (not e.g. Arabic-Indic) — it has no effect on the hour cycle.
const fixedTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatFixedTime(date: Date): string {
  return fixedTimeFormatter.format(date);
}
