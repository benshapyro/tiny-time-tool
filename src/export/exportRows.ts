// S10: shapes `DayEntry[]` (from `TimerEngine.entriesForDay`/
// `entriesForRange`) into `ExportRow[]` — the shared row model that
// `copyForAi.ts`, `csvExport.ts`, and `jsonExport.ts` all format from,
// exactly once, so the three export surfaces can never disagree on what a
// row's fields actually are (only on how those fields are rendered).
//
// Coordinator's pinned decisions for this slice (BUILD_SPEC S10 row +
// the amended auto-name/display-vs-data rule):
//   1. Exports use FIXED formats, never locale display formats — times are
//      24-hour (`formatFixedTime`), a null-name entry's auto-name task cell
//      uses the `en` short-date formatter, regardless of the entry's own
//      content language or the viewer's locale. "Display follows the human,
//      data stays machine-stable."
//   2. A null-name entry's `task` cell carries the SAME auto-name shape
//      Copy-for-AI's display renders — deliberately NOT
//      `formatEntryDisplayName` (that function is locale-parameterized for
//      DISPLAY surfaces; this is a distinct, always-fixed, export-only rule
//      that happens to share its `{date} · {start}–{end}` shape).
//   3. Empty client/project stay `null` here (the empty-CELL rendering —
//      CSV's blank cell, Copy-for-AI's em dash — is each presentation
//      layer's own job, not this shared row-building step's).
//   4. `duration_minutes` is an integer, round-half-up
//      (`roundMinutesHalfUp`, shared with `formatDurationHM` so a given
//      number of seconds never rounds two different ways across surfaces).

import { formatFixedTime, formatShortDate } from "../i18n";
import { entryDayKey, localDayKey } from "../timer/dayAttribution";
import { totalDurationSeconds } from "../timer/duration";
import { roundMinutesHalfUp } from "../timer/formatDuration";
import type { DayEntry } from "../timer/timerEngine";
import { toLocalIsoWithOffset } from "./isoOffset";

export interface ExportRow {
  /** `YYYY-MM-DD`, local — the day this entry is attributed to (same rule
   * as `entryDayKey`/Log/Insights: the local calendar day of the first
   * segment's start). */
  date: string;
  task: string;
  client: string | null;
  project: string | null;
  duration_minutes: number;
  first_start: string;
  last_end: string;
}

function exportAutoName(start: Date, end: Date): string {
  return `${formatShortDate("en", start)} · ${formatFixedTime(start)}–${formatFixedTime(end)}`;
}

export function buildExportRows(dayEntries: readonly DayEntry[], now: Date): ExportRow[] {
  return dayEntries.map(({ entry, segments }) => {
    const first = segments[0];
    const last = segments[segments.length - 1];
    const start = first ? new Date(first.startedAt) : now;
    const lastIsOpen = !last || last.endedAt === null;
    const end = lastIsOpen ? now : new Date(last.endedAt as string);

    return {
      date: first ? entryDayKey(first.startedAt) : localDayKey(now),
      task: entry.name ?? exportAutoName(start, end),
      client: entry.client,
      project: entry.project,
      duration_minutes: roundMinutesHalfUp(totalDurationSeconds(segments, now)),
      first_start: toLocalIsoWithOffset(start),
      last_end: toLocalIsoWithOffset(end),
    };
  });
}
