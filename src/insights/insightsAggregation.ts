// S11: pure aggregation functions over a week's worth of `DayEntry[]`
// (`TimerEngine.entriesForRange`'s row shape — reused, not reinvented,
// same as `LogController`/`ExportController` reuse `entriesForDay`). No
// TimerEngine, no clock injection ambiguity here beyond the one `now`
// parameter every duration computation in this project already takes
// (`duration.ts`'s `totalDurationSeconds`) — these three functions are
// exercised directly with plain fixture objects in
// `insightsAggregation.test.ts`, independent of SQLite.
//
// BUILD_SPEC S11 row, exactly three views:
//   - `hoursByDay`: this week's hours by day.
//   - `shareByTag`: share by tag, per client AND per project — percentage =
//     tag duration ÷ CURRENT-WEEK TOTAL (not the tag's own subtotal),
//     round-half-up to integer.
//   - `biggestTasks`: entries summed by the EXACT `(name, client, project)`
//     tuple, top 5 by summed duration.

import { entryDayKey } from "../timer/dayAttribution";
import { totalDurationSeconds } from "../timer/duration";
import { roundHalfUp } from "../timer/formatDuration";
import type { DayEntry } from "../timer/timerEngine";
import type { WeekRange } from "./weekRange";

export interface DayBucket {
  /** `YYYY-MM-DD`, local — one of `WeekRange.dayKeys`. */
  dayKey: string;
  seconds: number;
}

export interface TagShare {
  tag: string;
  seconds: number;
  /** Round-half-up integer, 0-100 — `roundHalfUp(seconds / weekTotal * 100)`.
   * `0` when the week total is 0 (nothing to divide by) rather than `NaN`. */
  percent: number;
}

export interface TagShares {
  client: TagShare[];
  project: TagShare[];
}

export interface TaskSummary {
  /** Always non-null: entries with no name (auto-named by date+time window)
   * are excluded — see `biggestTasks`'s doc comment for why. */
  name: string;
  client: string | null;
  project: string | null;
  seconds: number;
}

function entrySeconds(dayEntry: DayEntry, now: Date): number {
  return totalDurationSeconds(dayEntry.segments, now);
}

/** This week's hours by day. Buckets by the SAME day-attribution rule as
 * everywhere else (`entryDayKey`: local calendar day of the first
 * segment's start) — never a second rule for "which day this entry counts
 * toward." Returns exactly `weekRange.dayKeys.length` (7) buckets, one per
 * day, Monday first, in order — days with no entries return `seconds: 0`
 * rather than being omitted, so the view always renders all 7 columns
 * (Design principle 6: every state, including "no time that day," is
 * designed, not a gap in the data). Entries outside `weekRange` (should not
 * occur — the caller already scoped the query via `entriesForRange`) are
 * defensively skipped rather than corrupting an unrelated bucket. */
export function hoursByDay(dayEntries: readonly DayEntry[], weekRange: WeekRange, now: Date): DayBucket[] {
  const secondsByDay = new Map<string, number>(weekRange.dayKeys.map((dayKey) => [dayKey, 0]));
  for (const dayEntry of dayEntries) {
    const first = dayEntry.segments[0];
    if (!first) continue;
    const dayKey = entryDayKey(first.startedAt);
    if (!secondsByDay.has(dayKey)) continue;
    secondsByDay.set(dayKey, secondsByDay.get(dayKey)! + entrySeconds(dayEntry, now));
  }
  return weekRange.dayKeys.map((dayKey) => ({ dayKey, seconds: secondsByDay.get(dayKey)! }));
}

function weekTotalSeconds(dayEntries: readonly DayEntry[], now: Date): number {
  return dayEntries.reduce((sum, dayEntry) => sum + entrySeconds(dayEntry, now), 0);
}

function shareForTag(
  dayEntries: readonly DayEntry[],
  now: Date,
  tagOf: (dayEntry: DayEntry) => string | null,
): TagShare[] {
  const total = weekTotalSeconds(dayEntries, now);
  const secondsByTag = new Map<string, number>();
  for (const dayEntry of dayEntries) {
    const tag = tagOf(dayEntry);
    if (tag === null) continue; // untagged time has no row to add to — not a "0%" tag
    secondsByTag.set(tag, (secondsByTag.get(tag) ?? 0) + entrySeconds(dayEntry, now));
  }
  const rows = [...secondsByTag.entries()].map(([tag, seconds]) => ({
    tag,
    seconds,
    percent: total === 0 ? 0 : roundHalfUp((seconds / total) * 100),
  }));
  // Largest share first; alphabetical is a deterministic, arbitrary-free
  // tiebreak for equal-duration tags (never left to object/Map insertion
  // order, which would make the view's row order depend on entry-creation
  // order rather than the data being displayed).
  rows.sort((a, b) => b.seconds - a.seconds || a.tag.localeCompare(b.tag));
  return rows;
}

/** Share by tag, per client AND per project — two independent lists, each
 * percentage against the SAME denominator (the week's total across every
 * entry, tagged or not — BUILD_SPEC: "current-week total"). An entry with
 * both `@client` and `#project` tags contributes to one row in EACH list;
 * an entry with neither contributes to neither list (it has no tag to
 * share). The two lists' percentages therefore need not each sum to 100 —
 * untagged time is real time that simply has no tag row to display under. */
export function shareByTag(dayEntries: readonly DayEntry[], now: Date): TagShares {
  return {
    client: shareForTag(dayEntries, now, (dayEntry) => dayEntry.entry.client),
    project: shareForTag(dayEntries, now, (dayEntry) => dayEntry.entry.project),
  };
}

/** Biggest tasks: entries summed by the EXACT `(name, client, project)`
 * tuple — two entries sharing a name but differing in client OR project are
 * DIFFERENT rows (BUILD_SPEC: "exact tuple", not name alone). Top 5 by
 * summed duration, ties broken alphabetically by name for determinism.
 *
 * Entries with `name === null` (the auto-named "date · start–end" entries —
 * `entryDisplayName.ts`) are excluded: an auto-name is computed per-entry
 * from that entry's own start/end and is never the same string twice, so a
 * literal `(null, client, project)` tuple key would silently merge unrelated
 * unnamed entries into one bucket with no single coherent display name —
 * not what "biggest TASKS" means. This mirrors the existing
 * `TimerEngine.recentTaskNames` precedent, which already filters
 * `WHERE name IS NOT NULL` for the same "a task has a name" reasoning. */
export function biggestTasks(dayEntries: readonly DayEntry[], now: Date, limit = 5): TaskSummary[] {
  const byTuple = new Map<string, TaskSummary>();
  for (const dayEntry of dayEntries) {
    const { name, client, project } = dayEntry.entry;
    if (name === null) continue;
    const key = JSON.stringify([name, client, project]);
    const seconds = entrySeconds(dayEntry, now);
    const existing = byTuple.get(key);
    if (existing) {
      existing.seconds += seconds;
    } else {
      byTuple.set(key, { name, client, project, seconds });
    }
  }
  return [...byTuple.values()]
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name))
    .slice(0, limit);
}
