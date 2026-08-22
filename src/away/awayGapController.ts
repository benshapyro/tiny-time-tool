// S9: away-gap recovery (BUILD_SPEC S9 row). Modeled on `ReminderController`
// (S8) — the closest analogue in this codebase: a controller driven by
// periodic ticks, with a settings-backed persisted value (the heartbeat,
// mirroring `reminder.minutes`) and a driver seam (`SqlDriver` here,
// `NotificationDriver` there).
//
// Mechanism (deliberately the ONE the spec pins — no OS sleep/wake hooks,
// no `powerMonitor`-style events): a heartbeat timestamp is persisted to the
// `settings` table every 30s while the engine is "running" (bootstrap.ts's
// existing 30s ticker — the same one S8 already uses for reminders). The
// gap check compares wall-clock "now" against that stored heartbeat on
// EVERY tick, and once more at app launch. `check()` is the ONE method both
// call — there is no separate "launch" code path to drift out of sync with
// the tick path; a kill -9 and a clean tick both go through it identically.
//
// Baseline floor — how a stale or entirely absent heartbeat is handled
// without extra bookkeeping: the comparison point is
// `max(storedHeartbeat, openSegment.startedAt)`, never the stored value
// alone.
//   - A freshly `start()`ed entry has no heartbeat of its own yet — the
//     LAST stored value may belong to a previous, cleanly-stopped entry
//     (stale), or may not exist at all (a brand-new database). Using the
//     open segment's own start time as the floor means a fresh run is never
//     penalized for a stale/missing reading — mirrors `ReminderController`'s
//     "switching resets tracking": a new entry always begins its own
//     interval from zero rather than inheriting the outgoing entry's
//     progress.
//   - It also means going away immediately after starting — before the
//     first 30s tick ever writes a heartbeat — is still caught correctly:
//     the floor is the start time itself, so the gap is measured from the
//     true beginning of the segment.
//   - The ordinary `resume()` action gets this reset "for free": it creates
//     a brand-new segment, so its `startedAt` alone re-floors the check. The
//     "Keep" action below does NOT create a new segment (it reopens the old
//     one, whose `startedAt` is stale), which is exactly why `keep()`
//     explicitly re-stamps the heartbeat — see its own comment.
//
// The boundary is strict, per BUILD_SPEC: exactly 5m00s is ignored, 5m01s
// triggers. Compared in whole milliseconds (`>`, never `>=`) to avoid any
// floating-point drift from dividing by 1000 first.
//
// On trigger: `TimerEngine.pauseAt(lastConfirmedHeartbeat)` retroactively
// trims the open segment's end to the last confirmed-alive moment — never
// to "now" (BUILD_SPEC: "the user must not be billed for time they were
// away") — and the engine transitions to "paused". The resulting
// `AwayPrompt` is NOT persisted anywhere of its own: it is re-derived from
// scratch on every `check()` call, from data that is already persisted (the
// heartbeat row, and the engine's own running/paused state, itself derived
// from `segments.ended_at`). A kill -9 mid-away and a clean 30s-tick trigger
// both reconstruct the identical prompt this way — nothing new needs to
// survive a crash beyond what already does.
//
// Keep/discard semantics (BUILD_SPEC pins the LABEL — "add it back?" (keep
// / discard) — not the mechanics; this is the build's own reading, recorded
// for Ben's review):
//   - "Keep" = "add the away time back" = literally undo the trim
//     (`TimerEngine.reopenLastSegment`), returning to "running". The whole
//     span — including the time away — counts as tracked work, and the
//     timer keeps ticking forward live from the moment Keep is pressed,
//     exactly as if the auto-pause had never happened.
//   - "Discard" = "leave it trimmed" = nothing further: the segment already
//     ended at the last heartbeat (done at TRIGGER time in `check()`, not
//     deferred to this decision) and the engine stays "paused". Discard
//     does not auto-resume — the whole point of a prompt that waits for the
//     user is to let them decide when they are back, not to silently start
//     a fresh clock the instant they dismiss it.
// Both mutate a persisted entry, so both must reach every other surface:
// `check()`'s own trigger path and `keep()` notify `onEngineMutated` — the
// same cross-surface seam `LogController`/`ReminderController`'s siblings
// already use to reach the tray/popover/Log (`bootstrap.ts` wires this to
// `popover.refresh()`, which already cascades to the tray and the Log tab).
// `discard()` mutates nothing further, so it does not notify.

import type { SqlDriver } from "../timer/sqlDriver";
import type { TimerEngine } from "../timer/timerEngine";
import { getLastHeartbeat, setLastHeartbeat } from "./heartbeatStore";

/** BUILD_SPEC S9: "Gap > 5m auto-pauses ... gap <= 5m ignored" — the
 * boundary is strict (exactly 5m00s ignored, 5m01s triggers), enforced in
 * whole milliseconds in `check()` below. */
export const AWAY_GAP_THRESHOLD_MS = 5 * 60 * 1000;

export interface AwayPrompt {
  entryId: string;
  /** Raw seconds of the detected gap — `PopoverController` builds the
   * localized "Away Xh Ym" text from this via `formatDurationHM` (from
   * `src/timer/formatDuration.ts`), the SAME "day total" duration
   * formatter used everywhere else a summed (not ticking) duration is
   * shown; never a second formatter. */
  awaySeconds: number;
}

export interface AwayGapControllerOptions {
  engine: TimerEngine;
  driver: SqlDriver;
  clock?: () => Date;
  onStateChange?: (prompt: AwayPrompt | null) => void;
  /** Fired after every mutation that reaches the shared engine (the initial
   * trim in `check()`, and later `keep()`) — never after `discard()`, which
   * mutates nothing further. Wired to `popover.refresh()` in
   * `bootstrap.ts`, same seam `LogController`'s `onEngineMutated` uses. */
  onEngineMutated?: () => void | Promise<void>;
}

export class AwayGapController {
  readonly #engine: TimerEngine;
  readonly #driver: SqlDriver;
  readonly #clock: () => Date;
  readonly #onStateChange?: (prompt: AwayPrompt | null) => void;
  readonly #onEngineMutated?: () => void | Promise<void>;
  #prompt: AwayPrompt | null = null;

  constructor(options: AwayGapControllerOptions) {
    this.#engine = options.engine;
    this.#driver = options.driver;
    this.#clock = options.clock ?? (() => new Date());
    this.#onStateChange = options.onStateChange;
    this.#onEngineMutated = options.onEngineMutated;
  }

  /** The queued "Away Xh Ym — add it back?" prompt, or `null` when there is
   * nothing pending. */
  get prompt(): AwayPrompt | null {
    return this.#prompt;
  }

  /** Call once at app launch AND every 30s while the app is open (real app:
   * the same ticker `bootstrap.ts` already runs for S8's reminders) —
   * BUILD_SPEC: "the gap check runs on every heartbeat tick ... and once
   * at app launch". Both call sites run this exact method; there is
   * deliberately no separate "launch" code path to fall out of sync. */
  async check(): Promise<void> {
    // Investigated per this project's sabotage-drill discipline: removing
    // this early return alone does NOT turn any test red, because
    // TimerEngine's own invariant keeps `state` and "does the current
    // entry have an open segment" in lockstep for every reachable call path
    // (pause()/stop()/pauseAt() always close the segment in the same
    // synchronous step that flips the state, and no legitimate caller can
    // desync them) — so the `openSegment.endedAt !== null` check a few
    // lines down independently catches every "not really running" case
    // this guard would. Kept anyway as a documented, cheap short-circuit
    // (skips a DB round-trip for the common idle/paused case) and as an
    // explicit statement of intent, same reasoning `ReminderController`
    // gives for its own belt-and-suspenders `state !== "running"` guard —
    // but unlike that one, no test here can independently prove this
    // specific line load-bearing without corrupting the database out from
    // under the engine, which would not represent a reachable path.
    if (this.#engine.state !== "running") return;
    const entryId = this.#engine.currentEntryId;
    if (!entryId) return; // defensive: "running" always implies a current entry

    const segments = await this.#engine.segmentsFor(entryId);
    const openSegment = segments[segments.length - 1];
    if (!openSegment || openSegment.endedAt !== null) return; // catches paused/idle too — see the comment above

    const now = this.#clock();
    const stored = await getLastHeartbeat(this.#driver);
    const segmentStartMs = new Date(openSegment.startedAt).getTime();
    const storedMs = stored === null ? segmentStartMs : new Date(stored).getTime();
    // See the module doc comment's "baseline floor" section.
    const lastConfirmedMs = Math.max(storedMs, segmentStartMs);
    const gapMs = now.getTime() - lastConfirmedMs;

    if (gapMs > AWAY_GAP_THRESHOLD_MS) {
      const lastConfirmedIso = new Date(lastConfirmedMs).toISOString();
      await this.#engine.pauseAt(lastConfirmedIso);
      this.#prompt = { entryId, awaySeconds: Math.round(gapMs / 1000) };
      this.#onStateChange?.(this.#prompt);
      await this.#onEngineMutated?.();
      return; // don't stamp a fresh heartbeat onto a segment that's now closed
    }

    await setLastHeartbeat(this.#driver, now.toISOString());
  }

  /** "Keep" — see the module doc comment's Keep/discard semantics section.
   * Safe no-op when there is no pending prompt. */
  async keep(): Promise<void> {
    if (!this.#prompt) return;
    const { entryId } = this.#prompt;
    await this.#engine.reopenLastSegment(entryId);
    // Load-bearing, not defensive: the reopened segment's `startedAt` is
    // the ORIGINAL (stale) start time, not "now" — unlike `resume()`,
    // which always creates a fresh segment and gets a fresh floor for
    // free. Without this, the very next `check()` tick would immediately
    // re-measure against the pre-away heartbeat and re-trigger.
    await setLastHeartbeat(this.#driver, this.#clock().toISOString());
    this.#clearPrompt();
    await this.#onEngineMutated?.();
  }

  /** "Discard" — see the module doc comment. No further engine mutation:
   * the trim already happened at trigger time in `check()`. */
  discard(): void {
    if (!this.#prompt) return;
    this.#clearPrompt();
  }

  #clearPrompt(): void {
    this.#prompt = null;
    this.#onStateChange?.(null);
  }
}
