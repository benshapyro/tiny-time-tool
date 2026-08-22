// S2: the timer state machine (BUILD_SPEC S2 row). Business logic lives
// here in TS, not Rust, per the architecture constraint — plain, clock-
// injected, unit-testable without a native harness.
//
// State machine (documented + tested semantics — the spec names the states
// but leaves exact transition legality to this slice to decide):
//   idle --start()--> running --pause()--> paused --resume()--> running
//   running/paused --stop()--> idle
// `start()` is only legal from idle; `pause()` only from running; `resume()`
// only from paused; `stop()` from running or paused. Any other call throws
// `IllegalTransitionError` rather than silently no-op'ing — a caller that
// gets this wrong (e.g. double-pause from a race) needs to know, not have
// its mistake swallowed.
//
// Persistence: every transition that changes state also writes to the
// injected `SqlDriver` before updating in-memory state, so the two can
// never disagree. Rehydration (`TimerEngine.create`) reads whichever entry
// currently has an open segment (`ended_at IS NULL`) and resumes as
// "running" from it — the CI-safe analogue of "kill -9 and relaunch": a
// second `TimerEngine.create` against the same database file, with no
// coordination with the first, must reconstruct the same state.

import { entryDayKey } from "./dayAttribution";
import type { SqlDriver } from "./sqlDriver";
import type { Segment, TimeEntry } from "./types";
import { totalDurationSeconds } from "./duration";

export type TimerState = "idle" | "running" | "paused";

export class IllegalTransitionError extends Error {
  constructor(action: string, state: TimerState) {
    super(`Cannot ${action}() while ${state}`);
    this.name = "IllegalTransitionError";
  }
}

// S7: editing errors (BUILD_SPEC S7 row). Overlap semantics are decided and
// documented at length in timerEngine.editing.test.ts's module comment —
// summary: a segment's edited [start, end) range must not intersect ANY
// other segment's [start, end) in the whole database (not scoped to one
// entry or one day), because this engine's single-open-segment invariant
// means segments are never supposed to overlap at all. An open segment
// (`endedAt: null`) counts as unbounded (`+Infinity`) on its end for this
// check.
export class OverlapError extends Error {
  constructor() {
    super("Edited times overlap another segment");
    this.name = "OverlapError";
  }
}

export class InvalidRangeError extends Error {
  constructor() {
    super("End time must be after start time");
    this.name = "InvalidRangeError";
  }
}

/** BUILD_SPEC S7: "Running entry: ... its end time is not editable until
 * paused or stopped." The UI never renders a control that could trigger
 * this (Log.tsx has no end-time input at all for a running entry — see
 * Log.editing.test.tsx), but the engine enforces it independently rather
 * than trusting the UI to be the only thing that can call it. */
export class RunningSegmentEndNotEditableError extends Error {
  constructor() {
    super("Cannot edit the end time of a segment that is still running");
    this.name = "RunningSegmentEndNotEditableError";
  }
}

/** Deleting the entry the engine is currently tracking (running or paused)
 * would leave `#currentEntryId`/`#openSegmentId` pointing at a row that no
 * longer exists — a real state-corruption hazard, not just an edge case.
 * The Log UI disables Delete for the running entry (Log.tsx); this is the
 * defense-in-depth guard for any other caller. */
export class CannotDeleteRunningEntryError extends Error {
  constructor() {
    super("Cannot delete the entry that is currently running or paused — stop it first");
    this.name = "CannotDeleteRunningEntryError";
  }
}

export interface StartFields {
  name?: string | null;
  client?: string | null;
  project?: string | null;
}

interface EntryRow {
  id: string;
  name: string | null;
  client: string | null;
  project: string | null;
  created_at: string;
}

interface SegmentRow {
  id: string;
  entry_id: string;
  started_at: string;
  ended_at: string | null;
}

function entryFromRow(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    project: row.project,
    createdAt: row.created_at,
  };
}

function segmentFromRow(row: SegmentRow): Segment {
  return {
    id: row.id,
    entryId: row.entry_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

/** One entry plus its segments — `entriesForDay`'s row shape. Segments are
 * included because every downstream consumer (duration, display name) needs
 * them, and re-querying per entry from the caller would be the same N+1
 * pattern this method already avoids internally. */
export interface DayEntry {
  entry: TimeEntry;
  segments: Segment[];
}

export class TimerEngine {
  readonly #driver: SqlDriver;
  readonly #clock: () => Date;
  #state: TimerState;
  #currentEntryId: string | null;
  #openSegmentId: string | null;

  private constructor(
    driver: SqlDriver,
    clock: () => Date,
    state: TimerState,
    currentEntryId: string | null,
    openSegmentId: string | null,
  ) {
    this.#driver = driver;
    this.#clock = clock;
    this.#state = state;
    this.#currentEntryId = currentEntryId;
    this.#openSegmentId = openSegmentId;
  }

  /** Constructs an engine against `driver`, rehydrating state from
   * whichever open segment (if any) is currently on disk. This is the
   * function a fresh process calls on startup — it never assumes the
   * caller told it what state to be in. */
  static async create(driver: SqlDriver, clock: () => Date = () => new Date()): Promise<TimerEngine> {
    const openSegments = await driver.select<SegmentRow>(
      "SELECT * FROM segments WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    );
    const open = openSegments[0];
    if (open) {
      return new TimerEngine(driver, clock, "running", open.entry_id, open.id);
    }
    return new TimerEngine(driver, clock, "idle", null, null);
  }

  get state(): TimerState {
    return this.#state;
  }

  get currentEntryId(): string | null {
    return this.#currentEntryId;
  }

  async start(fields: StartFields = {}): Promise<TimeEntry> {
    if (this.#state !== "idle") {
      throw new IllegalTransitionError("start", this.#state);
    }
    const now = this.#clock();
    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      name: fields.name ?? null,
      client: fields.client ?? null,
      project: fields.project ?? null,
      createdAt: now.toISOString(),
    };
    await this.#driver.execute(
      "INSERT INTO time_entries (id, name, client, project, created_at) VALUES (?, ?, ?, ?, ?)",
      [entry.id, entry.name, entry.client, entry.project, entry.createdAt],
    );

    const segmentId = crypto.randomUUID();
    await this.#driver.execute(
      "INSERT INTO segments (id, entry_id, started_at, ended_at) VALUES (?, ?, ?, NULL)",
      [segmentId, entry.id, entry.createdAt],
    );

    this.#state = "running";
    this.#currentEntryId = entry.id;
    this.#openSegmentId = segmentId;
    return entry;
  }

  async pause(): Promise<void> {
    if (this.#state !== "running") {
      throw new IllegalTransitionError("pause", this.#state);
    }
    const now = this.#clock().toISOString();
    await this.#driver.execute("UPDATE segments SET ended_at = ? WHERE id = ?", [now, this.#openSegmentId]);
    this.#state = "paused";
    this.#openSegmentId = null;
  }

  async resume(): Promise<void> {
    if (this.#state !== "paused") {
      throw new IllegalTransitionError("resume", this.#state);
    }
    const now = this.#clock().toISOString();
    const segmentId = crypto.randomUUID();
    await this.#driver.execute(
      "INSERT INTO segments (id, entry_id, started_at, ended_at) VALUES (?, ?, ?, NULL)",
      [segmentId, this.#currentEntryId, now],
    );
    this.#state = "running";
    this.#openSegmentId = segmentId;
  }

  async stop(): Promise<void> {
    if (this.#state !== "running" && this.#state !== "paused") {
      throw new IllegalTransitionError("stop", this.#state);
    }
    if (this.#state === "running") {
      const now = this.#clock().toISOString();
      await this.#driver.execute("UPDATE segments SET ended_at = ? WHERE id = ?", [now, this.#openSegmentId]);
    }
    this.#state = "idle";
    this.#currentEntryId = null;
    this.#openSegmentId = null;
  }

  /** S4: names/tags an entry that has already started — the quick-entry
   * panel's Enter commit. Tracking begins at the shortcut press (`start()`,
   * with no fields); naming happens moments later here, so this never
   * touches segments/timestamps, only the entry row's display fields.
   * Legal in any state (the named entry need not still be the current
   * one — the Switch flow commits the outgoing entry's text after it has
   * already been stopped). */
  async setEntryFields(entryId: string, fields: StartFields): Promise<void> {
    await this.#driver.execute("UPDATE time_entries SET name = ?, client = ?, project = ? WHERE id = ?", [
      fields.name ?? null,
      fields.client ?? null,
      fields.project ?? null,
      entryId,
    ]);
  }

  /** S7: edits one segment's start and/or end time (rename/tags go through
   * `setEntryFields` above — this is only ever the time-range editor).
   * Either field may be omitted to leave it as-is; `endedAt` may not be
   * supplied for a segment that is still open (`RunningSegmentEndNotEditableError`
   * — BUILD_SPEC: the running entry's end time is not editable until paused
   * or stopped). Validates the resulting range (`InvalidRangeError` if
   * start >= end) and checks for overlap against every OTHER segment in the
   * database (`OverlapError` — see the class doc comment above for the
   * precise definition). Nothing is written unless every check passes. */
  async updateSegmentTimes(segmentId: string, fields: { startedAt?: string; endedAt?: string }): Promise<void> {
    const rows = await this.#driver.select<SegmentRow>("SELECT * FROM segments WHERE id = ?", [segmentId]);
    const row = rows[0];
    if (!row) {
      throw new Error(`Unknown segment ${segmentId}`);
    }

    if (row.ended_at === null && fields.endedAt !== undefined) {
      throw new RunningSegmentEndNotEditableError();
    }

    const newStart = fields.startedAt ?? row.started_at;
    const newEnd = fields.endedAt !== undefined ? fields.endedAt : row.ended_at;

    if (newEnd !== null && new Date(newStart).getTime() >= new Date(newEnd).getTime()) {
      throw new InvalidRangeError();
    }

    const others = await this.#driver.select<SegmentRow>("SELECT * FROM segments WHERE id != ?", [segmentId]);
    const newStartMs = new Date(newStart).getTime();
    const newEndMs = newEnd === null ? Number.POSITIVE_INFINITY : new Date(newEnd).getTime();
    for (const other of others) {
      const otherStartMs = new Date(other.started_at).getTime();
      const otherEndMs = other.ended_at === null ? Number.POSITIVE_INFINITY : new Date(other.ended_at).getTime();
      if (newStartMs < otherEndMs && otherStartMs < newEndMs) {
        throw new OverlapError();
      }
    }

    await this.#driver.execute("UPDATE segments SET started_at = ?, ended_at = ? WHERE id = ?", [
      newStart,
      newEnd,
      segmentId,
    ]);
  }

  /** S7: deletes an entry and every one of its segments. Refuses to delete
   * the entry the engine is currently tracking — see
   * `CannotDeleteRunningEntryError`'s doc comment. The caller (LogController)
   * is expected to snapshot the row via `entry()`/`segmentsFor()` BEFORE
   * calling this, so it can offer undo via `restoreEntry` below — this
   * method itself keeps no memory of what it deleted. */
  async deleteEntry(entryId: string): Promise<void> {
    if (entryId === this.#currentEntryId && this.#state !== "idle") {
      throw new CannotDeleteRunningEntryError();
    }
    await this.#driver.execute("DELETE FROM segments WHERE entry_id = ?", [entryId]);
    await this.#driver.execute("DELETE FROM time_entries WHERE id = ?", [entryId]);
  }

  /** S7: the undo half of delete. Re-inserts the exact rows a prior
   * `entry()`/`segmentsFor()` snapshot captured — same ids, same
   * timestamps — rather than reconstructing anything, so the restored row
   * is byte-identical to the one that was deleted (BUILD_SPEC S7
   * acceptance: "delete->undo restores the row byte-identical"). Callers
   * must snapshot BEFORE calling `deleteEntry`; this method has no way to
   * recover data it wasn't handed. */
  async restoreEntry(entry: TimeEntry, segments: readonly Segment[]): Promise<void> {
    await this.#driver.execute(
      "INSERT INTO time_entries (id, name, client, project, created_at) VALUES (?, ?, ?, ?, ?)",
      [entry.id, entry.name, entry.client, entry.project, entry.createdAt],
    );
    for (const segment of segments) {
      await this.#driver.execute("INSERT INTO segments (id, entry_id, started_at, ended_at) VALUES (?, ?, ?, ?)", [
        segment.id,
        segment.entryId,
        segment.startedAt,
        segment.endedAt,
      ]);
    }
  }

  /** S4: autocomplete data source — distinct non-null names, most recently
   * created first, capped at `limit`. */
  async recentTaskNames(limit: number): Promise<string[]> {
    const rows = await this.#driver.select<{ name: string }>(
      "SELECT name, MAX(created_at) as latest FROM time_entries WHERE name IS NOT NULL GROUP BY name ORDER BY latest DESC LIMIT ?",
      [limit],
    );
    return rows.map((row) => row.name);
  }

  /** S5: the popover's today-view data source. Day attribution is by the
   * local calendar day of each entry's *first* segment start (BUILD_SPEC
   * "Day attribution ... everywhere") — reuses `entryDayKey`, never
   * reimplements the rule. Two queries total regardless of entry count
   * (all entries, all segments, joined in memory) rather than one query per
   * entry — this app's per-day entry count is small, but N+1 queries over
   * IPC would still be the wrong default to establish. Entries with no
   * segments (should not occur in practice — every entry gets one at
   * `start()`) are excluded defensively rather than crashing on an empty
   * `segments[0]`. Ordered by creation, oldest first, matching every other
   * chronological listing in this file. */
  async entriesForDay(dayKey: string): Promise<DayEntry[]> {
    const entryRows = await this.#driver.select<EntryRow>("SELECT * FROM time_entries ORDER BY created_at ASC");
    const segmentRows = await this.#driver.select<SegmentRow>("SELECT * FROM segments ORDER BY started_at ASC");

    const segmentsByEntry = new Map<string, Segment[]>();
    for (const row of segmentRows) {
      const segment = segmentFromRow(row);
      const existing = segmentsByEntry.get(segment.entryId);
      if (existing) {
        existing.push(segment);
      } else {
        segmentsByEntry.set(segment.entryId, [segment]);
      }
    }

    const results: DayEntry[] = [];
    for (const row of entryRows) {
      const segments = segmentsByEntry.get(row.id);
      if (!segments || segments.length === 0) continue;
      const firstSegment = segments[0];
      if (firstSegment && entryDayKey(firstSegment.startedAt) === dayKey) {
        results.push({ entry: entryFromRow(row), segments });
      }
    }
    return results;
  }

  async entry(entryId: string): Promise<TimeEntry | null> {
    const rows = await this.#driver.select<EntryRow>("SELECT * FROM time_entries WHERE id = ?", [entryId]);
    const row = rows[0];
    return row ? entryFromRow(row) : null;
  }

  async segmentsFor(entryId: string): Promise<Segment[]> {
    const rows = await this.#driver.select<SegmentRow>(
      "SELECT * FROM segments WHERE entry_id = ? ORDER BY started_at ASC",
      [entryId],
    );
    return rows.map(segmentFromRow);
  }

  /** Sum of the entry's segments, per BUILD_SPEC ("duration = sum of
   * segments"); an open segment counts to this engine's injected `now`. */
  async durationSeconds(entryId: string): Promise<number> {
    const segments = await this.segmentsFor(entryId);
    return totalDurationSeconds(segments, this.#clock());
  }
}
