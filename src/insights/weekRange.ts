// S11: "this week" — the boundary Insights aggregates every one of its
// three views over (BUILD_SPEC S11 row; decisions.md #27 "no date-range
// builder"). There is exactly one definition of "current week" in this
// slice; every view (hours-by-day, tag share, biggest tasks) is computed
// against the SAME range, produced here once.
//
// Definition: Monday 00:00:00 through Sunday 23:59:59, in the viewer's
// LOCAL calendar — not UTC, not a rolling 7-day trailing window. Two
// reasons, both load-bearing:
//   1. Consistency with the app's one existing day-attribution rule
//      (`dayAttribution.ts`: "an entry belongs to the local calendar day of
//      its first segment's start, everywhere" — Log, Insights, CSV, Copy-
//      for-AI). A week built from local calendar days is the only definition
//      that agrees with a rule already pinned "everywhere" in BUILD_SPEC;
//      a UTC week would misattribute entries near local midnight the exact
//      way `localDayKey`'s own doc comment warns `toISOString` would.
//   2. Monday-start (not Sunday-start) matches the product's own framing:
//      this is a WORK-time tracker for a solution-consulting team costing
//      projects Mon-Fri, and BUILD_SPEC's own acceptance fixture pins a
//      value for "Tue" — a business-week reference point, not a calendar
//      convention that would be equally natural from a Sunday start.
//
// `now` is always the caller's injected clock (never `Date.now()`
// directly), matching every other clock-consuming function in this project
// (`duration.ts`, `dayAttribution.ts`'s callers, every controller).

import { localDayKey } from "../timer/dayAttribution";

export interface WeekRange {
  /** `YYYY-MM-DD`, local, inclusive — the Monday starting the week
   * containing `now`. */
  startDayKey: string;
  /** `YYYY-MM-DD`, local, inclusive — the Sunday ending it. Compares
   * correctly against `startDayKey` with plain string ordering, matching
   * `TimerEngine.entriesForRange`'s existing inclusive-range contract. */
  endDayKeyInclusive: string;
  /** The week's 7 local calendar days, Monday first, as `YYYY-MM-DD` keys
   * — the hours-by-day view's bucket keys, in display order. */
  dayKeys: string[];
}

/** `Date`'s own `getDay()` numbering (0=Sunday..6=Saturday) does not put
 * Monday first; this maps a weekday number to "days since the most recent
 * Monday" (Monday itself -> 0, Sunday -> 6). */
function daysSinceMonday(weekday: number): number {
  return (weekday + 6) % 7;
}

/** Computes the local-calendar week (Monday-Sunday, inclusive) containing
 * `now`. Pure function of `now`'s local date components — no dependency on
 * which day `now` falls on within the week (Monday and Sunday of the same
 * week both resolve to the same `WeekRange`). */
export function currentWeekRange(now: Date): WeekRange {
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(localMidnight);
  monday.setDate(monday.getDate() - daysSinceMonday(localMidnight.getDay()));

  const dayKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(day.getDate() + i);
    dayKeys.push(localDayKey(day));
  }

  return {
    startDayKey: dayKeys[0]!,
    endDayKeyInclusive: dayKeys[6]!,
    dayKeys,
  };
}
