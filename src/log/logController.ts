// S6: business logic for the Dashboard's Log tab (BUILD_SPEC S6 row).
// Mirrors `PopoverController` — the closest existing analogue — but shows
// one day at a time (with navigation) instead of always "today", and shows
// static start/end times, duration, and tags per entry instead of a live-
// ticking header. There is no live per-second tick here: the popover
// already owns "the glance surface"; the Log is a day-at-a-time record,
// correct as of its last `refresh()`, not a second display of the same
// live clock.
//
// Reuses rather than reinvents: `TimerEngine.entriesForDay` for the day's
// rows (day attribution rule lives there, once); `formatEntryDisplayName`
// for null-name entries; `formatDurationHM` for each entry's and the day's
// total duration; `formatDisplayTime` for locale-aware start/end times;
// `formatAccelerator` for the empty-state teach line, exactly like the
// popover's (S5 F6 finding: never render the raw `CmdOrCtrl` token).
//
// Read-only in S6: this controller has no start/pause/stop/rename methods.
// It observes the shared `TimerEngine`; it does not drive it — full editing
// lands in S7 (BUILD_SPEC S7 row: "Full editing in Log"). It still has a
// real cross-module obligation, though (the lesson from S5's review: "ask
// what else must observe that change"): every OTHER surface that mutates
// the engine — a shortcut press, a popover action, a panel commit — must be
// able to tell this controller to re-read it. `refresh()` is that seam;
// `bootstrap.ts` wires it into the same sync points that already keep the
// tray and popover correct.

import type { Locale } from "../i18n";
import { formatDisplayTime, interpolate, t } from "../i18n";
import { currentAcceleratorPlatform, formatAccelerator } from "../shortcuts/formatAccelerator";
import { localDayKey } from "../timer/dayAttribution";
import { totalDurationSeconds } from "../timer/duration";
import { formatEntryDisplayName } from "../timer/entryDisplayName";
import { formatDurationHM } from "../timer/formatDuration";
import type { TimerEngine } from "../timer/timerEngine";

export interface LogEntryView {
  id: string;
  name: string;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  client: string | null;
  project: string | null;
}

export interface LogState {
  /** `YYYY-MM-DD`, local — the day currently being viewed. */
  dayKey: string;
  isToday: boolean;
  /** Whether "next day" would still land on or before today. Forward
   * navigation is bounded at today — see `goToNextDay`'s doc comment for
   * why. Backward navigation is unbounded (reaches any past day). */
  canGoNext: boolean;
  entries: LogEntryView[];
  totalLabel: string;
  /** Set only when there are no entries for the viewed day — the designed
   * empty state naming the primary shortcut (Design principle 6: "the
   * empty log teaches the shortcut"). `null` whenever any entry exists. */
  emptyStateTeachLine: string | null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export interface LogControllerOptions {
  engine: TimerEngine;
  locale: Locale;
  /** The primary shortcut's current accelerator string (e.g.
   * `"CmdOrCtrl+Shift+Space"`), for the empty-state teach line — same seam
   * as `PopoverControllerOptions.primaryAccelerator`. */
  primaryAccelerator: string;
  clock?: () => Date;
  onStateChange?: (state: LogState) => void;
}

export class LogController {
  readonly #engine: TimerEngine;
  readonly #locale: Locale;
  readonly #primaryAccelerator: string;
  readonly #clock: () => Date;
  readonly #onStateChange?: (state: LogState) => void;
  #viewedDate: Date;
  /** True while the view should track "today" as the clock moves, rather
   * than staying pinned to a fixed date the user navigated to. */
  #followsToday: boolean;
  #state: LogState;

  constructor(options: LogControllerOptions) {
    this.#engine = options.engine;
    this.#locale = options.locale;
    this.#primaryAccelerator = options.primaryAccelerator;
    this.#clock = options.clock ?? (() => new Date());
    this.#onStateChange = options.onStateChange;
    this.#viewedDate = startOfDay(this.#clock());
    this.#followsToday = true;
    this.#state = {
      dayKey: localDayKey(this.#viewedDate),
      isToday: true,
      canGoNext: false,
      entries: [],
      totalLabel: formatDurationHM(0),
      emptyStateTeachLine: null,
    };
  }

  get state(): LogState {
    return this.#state;
  }

  /** Recomputes the full view for whichever day is currently being viewed.
   * Call on open, after navigating (the nav methods below already do
   * this), and whenever another surface mutates the shared engine while
   * the Dashboard is open — see the module doc comment. */
  async refresh(): Promise<void> {
    const now = this.#clock();
    const todayKey = localDayKey(now);
    // Review finding on S6: `#viewedDate` was pinned once at construction, so
    // a Dashboard left open across midnight kept repainting YESTERDAY — a
    // task started after midnight simply would not appear, and the only
    // recovery was clicking "Today". The Dashboard is the app's main window,
    // so staying open overnight is the normal case, not an edge case.
    if (this.#followsToday) {
      this.#viewedDate = startOfDay(now);
    }
    const dayKey = localDayKey(this.#viewedDate);
    const dayEntries = await this.#engine.entriesForDay(dayKey);

    const entries: LogEntryView[] = dayEntries.map(({ entry, segments }) => {
      const first = segments[0];
      const last = segments[segments.length - 1];
      const start = first ? new Date(first.startedAt) : now;
      const end = !last || last.endedAt === null ? now : new Date(last.endedAt);
      return {
        id: entry.id,
        name: formatEntryDisplayName(entry, segments, this.#locale, now),
        startLabel: formatDisplayTime(this.#locale, start),
        endLabel: formatDisplayTime(this.#locale, end),
        durationLabel: formatDurationHM(totalDurationSeconds(segments, now)),
        client: entry.client,
        project: entry.project,
      };
    });

    const totalSeconds = dayEntries.reduce((sum, { segments }) => sum + totalDurationSeconds(segments, now), 0);

    const emptyStateTeachLine =
      entries.length === 0
        ? interpolate(t(this.#locale, "log.emptyState"), {
            shortcut: formatAccelerator(this.#primaryAccelerator, currentAcceleratorPlatform(), this.#locale),
          })
        : null;

    this.#setState({
      dayKey,
      isToday: dayKey === todayKey,
      canGoNext: dayKey < todayKey,
      entries,
      totalLabel: formatDurationHM(totalSeconds),
      emptyStateTeachLine,
    });
  }

  /** Jumps back to today from any navigated-away day. */
  async goToday(): Promise<void> {
    this.#viewedDate = startOfDay(this.#clock());
    this.#followsToday = true;
    await this.refresh();
  }

  /** Unbounded: reaches any past day via repeated calls. */
  async goToPreviousDay(): Promise<void> {
    const previous = new Date(this.#viewedDate);
    previous.setDate(previous.getDate() - 1);
    this.#viewedDate = previous;
    this.#followsToday = false;
    await this.refresh();
  }

  /** Bounded at today. A future day can never have entries — there is
   * nothing to view yet — so letting the user navigate past today would
   * only ever land them on a confusing "press the shortcut to start
   * tracking" empty state for a day that has not happened. Recomputes the
   * candidate day directly against the injected clock rather than trusting
   * `state.canGoNext` (which could be stale if called before any
   * `refresh()`), so the bound holds even then. */
  async goToNextDay(): Promise<void> {
    const todayKey = localDayKey(this.#clock());
    const candidate = new Date(this.#viewedDate);
    candidate.setDate(candidate.getDate() + 1);
    if (localDayKey(candidate) > todayKey) return;
    this.#viewedDate = candidate;
    // Stepping forward ONTO today re-arms the follow behaviour; landing on
    // any earlier day keeps the view pinned where the user put it.
    this.#followsToday = localDayKey(candidate) === todayKey;
    await this.refresh();
  }

  #setState(patch: Partial<LogState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.#state);
  }
}
