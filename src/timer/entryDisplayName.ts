// BUILD_SPEC "Pinned interfaces" — auto-name display format, rendered at
// display time and never stored: `{localized short date} · {start}–{end}`
// with an en dash. en-US: `Aug 21 · 10:00 AM–10:45 AM`; es:
// `21 ago · 10:00–10:45`. Reuses the i18n layer's locale-aware formatters
// (`formatShortDate`/`formatDisplayTime`) rather than reimplementing
// locale rules here.

import type { Locale } from "../i18n";
import { formatDisplayTime, formatShortDate } from "../i18n";
import type { Segment, TimeEntry } from "./types";

/** `entry.name` when set; otherwise the localized auto-name computed from
 * `segments` — start of the first segment, end of the last (or `now` if
 * the last segment is still open, i.e. the entry is currently running). */
export function formatEntryDisplayName(
  entry: Pick<TimeEntry, "name">,
  segments: readonly Segment[],
  locale: Locale,
  now: Date,
): string {
  if (entry.name !== null) return entry.name;

  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return ""; // defensive: an entry always has >=1 segment in practice

  const start = new Date(first.startedAt);
  const end = last.endedAt === null ? now : new Date(last.endedAt);

  return `${formatShortDate(locale, start)} · ${formatDisplayTime(locale, start)}–${formatDisplayTime(locale, end)}`;
}
