// S5: the tray popover's business logic (BUILD_SPEC S5 row). Lives in TS,
// decoupled from any real Tauri window — same architecture as S4's
// `QuickEntryController`: `Popover.tsx` is a thin renderer of `this.state`,
// and the real cross-window wiring (`PopoverContainer.tsx` + the "popover"
// half of `bootstrap.ts`) is exercised live, not by unit tests, per this
// project's established "no unit test for the IPC glue itself" convention.
//
// Reuses rather than reinvents: `TimerEngine.entriesForDay` for the day's
// entries (day attribution rule lives there, once); `formatEntryDisplayName`
// for null-name entries; `formatDurationHM` for the "Xh Ym" day total;
// `formatElapsed` for the ticking `M:SS`/`H:MM:SS` format (the live-tick
// re-render itself is the presentational component's job — see
// `Popover.tsx` — this controller only supplies the elapsed-seconds
// snapshot as of the last `refresh()`).
//
// Switch is delegated, not duplicated: `switchTask()` calls the injected
// `onSwitch` callback (wired to `bootstrap.ts`'s `switchAction()` in the
// real app) and does nothing else — the actual stop-current/start-new
// happens later, in the quick-entry panel's commit, in a different window.
// Duplicating that logic here would be exactly the kind of drift BUILD_SPEC
// warns against ("Wire Switch to the existing switchAction() seam").

import type { AwayGapController } from "../away/awayGapController";
import type { Locale } from "../i18n";
import { interpolate, t } from "../i18n";
import { localDayKey } from "../timer/dayAttribution";
import { totalDurationSeconds } from "../timer/duration";
import { formatEntryDisplayName } from "../timer/entryDisplayName";
import { formatDurationHM } from "../timer/formatDuration";
import type { TimerEngine, TimerState } from "../timer/timerEngine";
import { currentAcceleratorPlatform, formatAccelerator } from "../shortcuts/formatAccelerator";
import type { TrayState } from "../tray/trayState";

export type EntryStatus = "running" | "paused" | "stopped";

/** S9: the away-gap recovery prompt, as the popover renders it — a fully
 * localized message string (built here via `t()`/`interpolate()`, never in
 * the presentational component, matching every other pre-localized field
 * on this state), plus the entry id `awayKeep`/`awayDiscard` act on. */
export interface AwayPromptView {
  entryId: string;
  message: string;
}

export interface PopoverEntryView {
  id: string;
  name: string;
  durationLabel: string;
  status: EntryStatus;
}

export interface PopoverState {
  entries: PopoverEntryView[];
  totalLabel: string;
  timerStatus: TimerState;
  /** Elapsed seconds for the current entry as of the last `refresh()`;
   * `0` when idle. The live per-second tick between refreshes is the
   * presentational component's concern, not this controller's. */
  elapsedSeconds: number;
  /** Set only when there are no entries for the day — the empty-state
   * teach line naming the primary shortcut (BUILD_SPEC: "Press {primary
   * shortcut} to start tracking"). `null` whenever any entry exists. */
  teachLine: string | null;
  /** S9: set whenever the wired `AwayGapController` has a pending "Away Xh
   * Ym — add it back?" prompt; `null` otherwise (including when no
   * `AwayGapController` is wired at all — see `PopoverControllerOptions`). */
  awayPrompt: AwayPromptView | null;
}

const EMPTY_STATE: PopoverState = {
  entries: [],
  totalLabel: formatDurationHM(0),
  timerStatus: "idle",
  elapsedSeconds: 0,
  teachLine: null,
  awayPrompt: null,
};

export interface PopoverControllerOptions {
  engine: TimerEngine;
  locale: Locale;
  /** The primary shortcut's current accelerator string (e.g.
   * `"CmdOrCtrl+Shift+Space"`), for the empty-state teach line. */
  primaryAccelerator: string;
  clock?: () => Date;
  /** Delegates the Switch action to `bootstrap.ts`'s `switchAction()` seam
   * in the real app. Left undefined in tests that don't exercise Switch. */
  onSwitch?: () => void | Promise<void>;
  onStateChange?: (state: PopoverState) => void;
  /** Fires on every refresh with the resulting tray state and elapsed
   * seconds. Review finding on S5: popover actions drove the engine but
   * nothing reached the tray, so pressing Start here left the tray showing
   * Idle and pressing Stop left it ticking on a stopped timer. The
   * shortcut path had this wired; the popover path never did. Firing from
   * `refresh()` rather than from each action means every path that can
   * change state — including future ones — syncs the tray by construction. */
  onTrayStateChange?: (state: TrayState, elapsedSeconds: number) => void;
  /** S9: optional — when wired, the popover surfaces its `.prompt` as
   * `PopoverState.awayPrompt` and `awayKeep()`/`awayDiscard()` delegate to
   * it. Left undefined in tests/callers that don't exercise away-gap
   * recovery, same optionality convention as `onSwitch`. */
  awayGap?: AwayGapController;
}

export class PopoverController {
  readonly #engine: TimerEngine;
  #locale: Locale;
  readonly #primaryAccelerator: string;
  readonly #clock: () => Date;
  readonly #onSwitch?: () => void | Promise<void>;
  readonly #onStateChange?: (state: PopoverState) => void;
  readonly #onTrayStateChange?: (state: TrayState, elapsedSeconds: number) => void;
  readonly #awayGap?: AwayGapController;
  #state: PopoverState;

  constructor(options: PopoverControllerOptions) {
    this.#engine = options.engine;
    this.#locale = options.locale;
    this.#primaryAccelerator = options.primaryAccelerator;
    this.#clock = options.clock ?? (() => new Date());
    this.#onSwitch = options.onSwitch;
    this.#onStateChange = options.onStateChange;
    this.#onTrayStateChange = options.onTrayStateChange;
    this.#awayGap = options.awayGap;
    this.#state = EMPTY_STATE;
  }

  get state(): PopoverState {
    return this.#state;
  }

  /** S12 review fix: the live-locale seam — mirrors `ReminderController.
   * setMinutes()`'s "persistence and live behaviour are separate" split.
   * Entry names, the teach line, and the away-prompt message are baked by
   * the last `refresh()` under the OLD locale — this only updates which
   * locale FUTURE computations use; the caller is responsible for calling
   * `refresh()` afterward to re-push the current view live. */
  setLocale(locale: Locale): void {
    this.#locale = locale;
  }

  /** Recomputes the full view from the engine + database. Call on open and
   * after every action (each action method already does this). */
  async refresh(): Promise<void> {
    const now = this.#clock();
    const dayKey = localDayKey(now);
    const dayEntries = await this.#engine.entriesForDay(dayKey);
    const currentEntryId = this.#engine.currentEntryId;
    const timerStatus = this.#engine.state;

    const rows = dayEntries.map(({ entry, segments }) => ({
      entry,
      segments,
      durationSeconds: totalDurationSeconds(segments, now),
      status: (entry.id === currentEntryId && timerStatus !== "idle" ? timerStatus : "stopped") as EntryStatus,
    }));

    const entries: PopoverEntryView[] = rows.map((row) => ({
      id: row.entry.id,
      name: formatEntryDisplayName(row.entry, row.segments, this.#locale, now),
      durationLabel: formatDurationHM(row.durationSeconds),
      status: row.status,
    }));

    const totalSeconds = rows.reduce((sum, row) => sum + row.durationSeconds, 0);
    const elapsedSeconds = currentEntryId ? await this.#engine.durationSeconds(currentEntryId) : 0;
    const teachLine =
      entries.length === 0
        ? interpolate(t(this.#locale, "popover.teachLine"), { shortcut: formatAccelerator(this.#primaryAccelerator, currentAcceleratorPlatform(), this.#locale) })
        : null;

    const pending = this.#awayGap?.prompt ?? null;
    const awayPrompt: AwayPromptView | null = pending
      ? {
          entryId: pending.entryId,
          message: interpolate(t(this.#locale, "away.prompt.message"), {
            elapsed: formatDurationHM(pending.awaySeconds),
          }),
        }
      : null;

    this.#setState({
      entries,
      totalLabel: formatDurationHM(totalSeconds),
      timerStatus,
      elapsedSeconds,
      teachLine,
      awayPrompt,
    });

    // Keep the tray in step with whatever just happened, whichever surface
    // caused it. See `onTrayStateChange` above.
    this.#onTrayStateChange?.(timerStatus, elapsedSeconds);
  }

  async start(): Promise<void> {
    await this.#engine.start();
    await this.refresh();
  }

  async pause(): Promise<void> {
    await this.#engine.pause();
    await this.refresh();
  }

  async resume(): Promise<void> {
    await this.#engine.resume();
    await this.refresh();
  }

  async stop(): Promise<void> {
    await this.#engine.stop();
    await this.refresh();
  }

  /** The Switch action: delegates to `onSwitch` (the real app wires this to
   * `switchAction()`, which stops the current entry and opens the
   * quick-entry panel for the new one) and does nothing further — the
   * popover doesn't own that state change, the panel's later commit does. */
  async switchTask(): Promise<void> {
    await this.#onSwitch?.();
  }

  /** S9: "Keep" — delegates the mutation to the wired `AwayGapController`
   * (see its own doc comment for the Keep/discard semantics), then
   * refreshes so the popover's own state (entries, elapsed, `awayPrompt`)
   * reflects the result immediately. A safe no-op when no away controller
   * is wired, or it has no pending prompt. */
  async awayKeep(): Promise<void> {
    await this.#awayGap?.keep();
    await this.refresh();
  }

  /** S9: "Discard" — see `awayKeep()`'s doc comment; same shape, the other
   * decision. */
  async awayDiscard(): Promise<void> {
    this.#awayGap?.discard();
    await this.refresh();
  }

  #setState(patch: Partial<PopoverState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.#state);
  }
}
