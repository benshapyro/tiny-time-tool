// S11: business logic for the Dashboard's Insights tab (BUILD_SPEC S11 row;
// decisions.md #27 "v1-lite... no date-range builder"). Mirrors
// `LogController`/`ExportController`'s architecture — a real `TimerEngine`,
// clock injected, `refresh()` recomputes the whole view — but unlike both of
// those, Insights has NO mutating actions of its own: it is a pure read
// surface over the current week, so there is no `saveEdit`/`deleteEntry`/
// `copyTodayForAi` analogue here, only `refresh()`.
//
// Reuses rather than reinvents: `currentWeekRange` for the one "this week"
// definition (`weekRange.ts`); `TimerEngine.entriesForRange` for the week's
// rows (same method S10's CSV/JSON range export already uses); `hoursByDay`/
// `shareByTag`/`biggestTasks` (`insightsAggregation.ts`) for the three
// views' pure aggregation rules; `formatDurationHM` for every duration
// label; `formatWeekdayShort`/`formatPercent` for the locale-sensitive
// weekday and percentage display text (S10's design-review lesson: dates,
// times, weekday names, and percentages are ALL locale-sensitive surfaces,
// not just the ones already caught).
//
// Cross-module obligation, same lesson as `logController.ts`'s own module
// comment: Insights is read-only, so it never fires an `onEngineMutated`
// seam of its own, but it DOES need refreshing when some OTHER surface
// mutates the shared engine while the Dashboard is open (an edited entry's
// time could move it into or out of the current week). `bootstrap.ts` wires
// `insights.refresh()` alongside every existing `dashboard.refresh()` call.

import type { Locale } from "../i18n";
import { formatPercent, formatWeekdayShort } from "../i18n";
import { dayKeyToDate } from "../timer/dayAttribution";
import { formatDurationHM } from "../timer/formatDuration";
import type { TimerEngine } from "../timer/timerEngine";
import { biggestTasks, hoursByDay, shareByTag } from "./insightsAggregation";
import type { TagShare, TaskSummary } from "./insightsAggregation";
import { currentWeekRange } from "./weekRange";

export interface InsightsDayView {
  /** `YYYY-MM-DD`, local. */
  dayKey: string;
  /** Locale-aware abbreviated weekday name ("Tue" / "mar"). */
  weekdayLabel: string;
  durationLabel: string;
  seconds: number;
}

export interface InsightsTagView {
  tag: string;
  durationLabel: string;
  /** Locale-formatted, e.g. "62%" (en) / "62 %" (es). */
  percentLabel: string;
}

export interface InsightsTaskView {
  name: string;
  client: string | null;
  project: string | null;
  durationLabel: string;
}

export interface InsightsState {
  /** This week's 7 days, Monday first — always exactly 7, even before the
   * first `refresh()` resolves the day fixtures live from the engine
   * (`hoursByDay` never omits a day). */
  days: InsightsDayView[];
  /** Largest single day's seconds this week — the hours-by-day view's bar
   * scale. `0` when every day is empty, which the view treats as "all bars
   * flat," not a division by zero. */
  maxDaySeconds: number;
  clientShares: InsightsTagView[];
  projectShares: InsightsTagView[];
  biggestTasks: InsightsTaskView[];
  /** True when the current week has zero tracked seconds across every
   * entry — the designed empty state (Design principle 6), distinct from
   * "some views are empty but others have data" (e.g. a week with only
   * untagged time has empty tag-share lists but a real hours-by-day view;
   * that is NOT `isEmpty`). */
  isEmpty: boolean;
}

function idleState(): InsightsState {
  return {
    days: [],
    maxDaySeconds: 0,
    clientShares: [],
    projectShares: [],
    biggestTasks: [],
    isEmpty: true,
  };
}

function toTagView(locale: Locale, rows: readonly TagShare[]): InsightsTagView[] {
  return rows.map((row) => ({
    tag: row.tag,
    durationLabel: formatDurationHM(row.seconds),
    percentLabel: formatPercent(locale, row.percent),
  }));
}

function toTaskView(rows: readonly TaskSummary[]): InsightsTaskView[] {
  return rows.map((row) => ({
    name: row.name,
    client: row.client,
    project: row.project,
    durationLabel: formatDurationHM(row.seconds),
  }));
}

export interface InsightsControllerOptions {
  engine: TimerEngine;
  locale: Locale;
  clock?: () => Date;
  onStateChange?: (state: InsightsState) => void;
}

export class InsightsController {
  readonly #engine: TimerEngine;
  #locale: Locale;
  readonly #clock: () => Date;
  readonly #onStateChange?: (state: InsightsState) => void;
  #state: InsightsState;

  constructor(options: InsightsControllerOptions) {
    this.#engine = options.engine;
    this.#locale = options.locale;
    this.#clock = options.clock ?? (() => new Date());
    this.#onStateChange = options.onStateChange;
    this.#state = idleState();
  }

  get state(): InsightsState {
    return this.#state;
  }

  /** S12 review fix: the live-locale seam — mirrors `ReminderController.
   * setMinutes()`'s "persistence and live behaviour are separate" split.
   * `days[].weekdayLabel` and every `percentLabel` are baked by the last
   * `refresh()` under the OLD locale — this only updates which locale
   * FUTURE computations use; the caller is responsible for calling
   * `refresh()` afterward to re-push the current week's view live. */
  setLocale(locale: Locale): void {
    this.#locale = locale;
  }

  /** Recomputes the full view for the CURRENT week (the injected clock's
   * "now" at call time — never cached from construction, so a Dashboard
   * left open across a week boundary picks up the new week on its next
   * refresh, same reasoning as `LogController.refresh`'s own "left open
   * overnight" fix). */
  async refresh(): Promise<void> {
    const now = this.#clock();
    const week = currentWeekRange(now);
    const dayEntries = await this.#engine.entriesForRange(week.startDayKey, week.endDayKeyInclusive);

    const buckets = hoursByDay(dayEntries, week, now);
    const days: InsightsDayView[] = buckets.map((bucket) => ({
      dayKey: bucket.dayKey,
      weekdayLabel: formatWeekdayShort(this.#locale, dayKeyToDate(bucket.dayKey)),
      durationLabel: formatDurationHM(bucket.seconds),
      seconds: bucket.seconds,
    }));
    const maxDaySeconds = buckets.reduce((max, bucket) => Math.max(max, bucket.seconds), 0);
    const weekTotalSeconds = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);

    const shares = shareByTag(dayEntries, now);
    const tasks = biggestTasks(dayEntries, now);

    this.#setState({
      days,
      maxDaySeconds,
      clientShares: toTagView(this.#locale, shares.client),
      projectShares: toTagView(this.#locale, shares.project),
      biggestTasks: toTaskView(tasks),
      isEmpty: weekTotalSeconds === 0,
    });
  }

  #setState(patch: Partial<InsightsState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.#state);
  }
}
