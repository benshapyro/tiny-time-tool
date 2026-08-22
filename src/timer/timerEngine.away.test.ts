// S9: engine-level primitives for away-gap recovery (BUILD_SPEC S9 row).
// Split from timerEngine.test.ts (S2) / timerEngine.editing.test.ts (S7),
// same convention: a distinct concern (retroactively closing/reopening the
// CURRENTLY open or just-closed segment at an explicit timestamp) from the
// state machine and historical-edit tests already there.
//
// `pauseAt(timestamp)` is `pause()` with the clock replaced by an explicit
// timestamp — AwayGapController uses it to trim the open segment's end back
// to the last confirmed-alive heartbeat, never to "now" (BUILD_SPEC: "the
// user must not be billed for time they were away").
//
// `reopenLastSegment(entryId)` is the undo half — the away prompt's "Keep"
// action ("add it back?"). It reopens the entry's most recently closed
// segment (clearing `ended_at`) and returns to "running", rather than
// starting a new segment the way `resume()` does — the whole point is that
// the trimmed span is restored, not that a fresh span begins.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "./testSqliteSupport";
import { IllegalTransitionError, TimerEngine } from "./timerEngine";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s9-engine-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    advanceTo: (nextIso: string) => {
      current = new Date(nextIso);
    },
  };
}

describe("TimerEngine.pauseAt", () => {
  it("closes the open segment at the GIVEN timestamp, not the clock's current time", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    clock.advanceTo("2026-08-21T20:00:00.000Z"); // clock has moved far ahead

    await engine.pauseAt("2026-08-21T09:12:00.000Z"); // but we trim to this

    expect(engine.state).toBe("paused");
    const [segment] = await engine.segmentsFor(entry.id);
    expect(segment?.endedAt).toBe("2026-08-21T09:12:00.000Z");
    expect(await engine.durationSeconds(entry.id)).toBe(12 * 60);
  });

  it("persists the trim to SQLite, verified by re-reading through a fresh engine instance", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await engine.pauseAt("2026-08-21T09:05:00.000Z");

    const rehydrated = await TimerEngine.create(driver, clock.now);
    const reread = await rehydrated.segmentsFor(entry.id);
    expect(reread[0]?.endedAt).toBe("2026-08-21T09:05:00.000Z");
    expect(rehydrated.state).toBe("idle"); // no open segment left to rehydrate as running
  });

  it("throws IllegalTransitionError when not running (paused)", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    await engine.start();
    await engine.pause();

    await expect(engine.pauseAt("2026-08-21T09:05:00.000Z")).rejects.toThrow(IllegalTransitionError);
  });

  it("throws IllegalTransitionError when idle", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));

    await expect(engine.pauseAt("2026-08-21T09:05:00.000Z")).rejects.toThrow(IllegalTransitionError);
  });
});

describe("TimerEngine.reopenLastSegment", () => {
  it("reopens the entry's most recently closed segment and returns to running", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await engine.pauseAt("2026-08-21T09:05:00.000Z");
    clock.advanceTo("2026-08-21T09:20:00.000Z");

    await engine.reopenLastSegment(entry.id);

    expect(engine.state).toBe("running");
    expect(engine.currentEntryId).toBe(entry.id);
    const [segment] = await engine.segmentsFor(entry.id);
    expect(segment?.endedAt).toBeNull();
    // Duration now counts all the way to "now" again — the away span is
    // back in, exactly as if the trim never happened.
    expect(await engine.durationSeconds(entry.id)).toBe(20 * 60);
  });

  it("persists the reopen to SQLite, verified through a fresh engine instance", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await engine.pauseAt("2026-08-21T09:05:00.000Z");
    await engine.reopenLastSegment(entry.id);

    const rehydrated = await TimerEngine.create(driver, clock.now);
    expect(rehydrated.state).toBe("running");
    expect(rehydrated.currentEntryId).toBe(entry.id);
  });

  it("throws IllegalTransitionError when the engine isn't paused", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const entry = await engine.start();

    await expect(engine.reopenLastSegment(entry.id)).rejects.toThrow(IllegalTransitionError);
  });

  it("throws IllegalTransitionError when paused on a DIFFERENT entry than the one requested", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const entry = await engine.start();
    await engine.pause();

    await expect(engine.reopenLastSegment("some-other-entry-id")).rejects.toThrow(IllegalTransitionError);
    // Sanity: the real entry id would have been fine.
    await engine.reopenLastSegment(entry.id);
    expect(engine.state).toBe("running");
  });
});
