// BUILD_SPEC ("Pinned interfaces" / decisions.md #44): an entry belongs to
// the *local* calendar day of its first segment's start — everywhere (Log,
// Insights, CSV `date`, Copy-for-AI). A rare overnight entry (e.g.
// 23:30→00:45) is not split across two days.

/** Local calendar-day key (`YYYY-MM-DD`) for a `Date`, in the machine's own
 * timezone — deliberately `getFullYear`/`getMonth`/`getDate` (local), never
 * `toISOString`'s UTC slice, which would misattribute any entry near a
 * timezone's midnight-vs-UTC-midnight gap. */
export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The day an entry is attributed to: the local calendar day of its first
 * segment's `startedAt`. Takes the ISO8601 string directly (not a `Date`)
 * since that's what's persisted and read back from `Segment.startedAt`. */
export function entryDayKey(firstSegmentStartedAt: string): string {
  return localDayKey(new Date(firstSegmentStartedAt));
}

/** Inverse of `localDayKey`: reconstructs the local midnight `Date` for a
 * `YYYY-MM-DD` key (S6: the Log tab's date-nav header needs to render
 * whichever day is being viewed). Deliberately built from numeric Y/M/D
 * components (`new Date(y, m-1, d)`), never `new Date(dayKey)` — that
 * parses as UTC midnight and would shift the date by a day in any
 * negative-UTC-offset timezone, exactly the class of bug this file's own
 * `localDayKey` comment already warns about. */
export function dayKeyToDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}
