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

  /** S4: autocomplete data source — distinct non-null names, most recently
   * created first, capped at `limit`. */
  async recentTaskNames(limit: number): Promise<string[]> {
    const rows = await this.#driver.select<{ name: string }>(
      "SELECT name, MAX(created_at) as latest FROM time_entries WHERE name IS NOT NULL GROUP BY name ORDER BY latest DESC LIMIT ?",
      [limit],
    );
    return rows.map((row) => row.name);
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
