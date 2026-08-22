// S7: engine-level editing primitives (BUILD_SPEC S7 row: "Full editing in
// Log: rename, edit start/stop times, edit tags, delete (with undo toast),
// any day"). Split from timerEngine.test.ts (S2) rather than appended to it,
// same convention as panelWiring.test.ts living apart from
// quickEntryController.test.ts — these are a distinct concern (editing an
// already-persisted row) from the state-machine tests already there.
//
// Overlap semantics, decided here and nowhere else (BUILD_SPEC S7 row asks
// the build to "decide and document precisely what overlap means"): this
// app's TimerEngine only ever has ONE open segment at a time (`start()` is
// only legal from idle), so in an unedited database, segments — across
// EVERY entry, not just one entry's own — never overlap in time. Editing a
// segment's start/end is the only way that invariant could break. So
// "overlap" here means: after the edit, does the segment's new
// [start, end) range intersect ANY other segment's [start, end) range,
// checked against every segment in the database, not scoped to one entry or
// one calendar day. Scoping to "same day" would miss the case where an
// edited segment is dragged across a day boundary into a segment that
// belongs to a different attributed day (BUILD_SPEC: day attribution is by
// first-segment-start, so two segments five minutes apart can already
// belong to different attributed days for an entry that starts right before
// midnight) — a global check is both simpler and strictly more correct.
// A still-open segment (`endedAt: null`, i.e. the live segment of whatever
// is currently running/paused) is treated as unbounded on its end
// (`+Infinity`) for this check, since "now" keeps moving.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "./testSqliteSupport";
import {
  CannotDeleteRunningEntryError,
  InvalidRangeError,
  OverlapError,
  RunningSegmentEndNotEditableError,
  TimerEngine,
} from "./timerEngine";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s7-engine-"));
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

describe("TimerEngine.updateSegmentTimes — persistence and duration recompute", () => {
  it("persists an edited start time to SQLite, verified by re-reading raw rows through a second engine instance", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Client call" });
    clock.advanceTo("2026-08-20T09:30:00.000Z");
    await engine.stop();

    const [segment] = await engine.segmentsFor(entry.id);
    await engine.updateSegmentTimes(segment!.id, { startedAt: "2026-08-20T09:15:00.000Z" });

    // Re-read through a FRESH engine against the same file, not the
    // in-memory object the edit call already had a reference to — this is
    // what actually proves the write reached SQLite.
    const rehydrated = await TimerEngine.create(driver, clock.now);
    const reread = await rehydrated.segmentsFor(entry.id);
    expect(reread[0]?.startedAt).toBe("2026-08-20T09:15:00.000Z");
    expect(reread[0]?.endedAt).toBe("2026-08-20T09:30:00.000Z");
  });

  it("duration recomputes after an edit — a shortened segment yields a shorter total", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start();
    clock.advanceTo("2026-08-20T10:00:00.000Z"); // 60m as recorded
    await engine.stop();
    expect(await engine.durationSeconds(entry.id)).toBe(60 * 60);

    const [segment] = await engine.segmentsFor(entry.id);
    await engine.updateSegmentTimes(segment!.id, { endedAt: "2026-08-20T09:20:00.000Z" }); // now 20m

    expect(await engine.durationSeconds(entry.id)).toBe(20 * 60);
  });

  it("editing only the end time leaves the start time untouched, and vice versa", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start();
    clock.advanceTo("2026-08-20T09:30:00.000Z");
    await engine.stop();
    const [segment] = await engine.segmentsFor(entry.id);

    await engine.updateSegmentTimes(segment!.id, { endedAt: "2026-08-20T09:45:00.000Z" });
    let reread = await engine.segmentsFor(entry.id);
    expect(reread[0]).toMatchObject({
      startedAt: "2026-08-20T09:00:00.000Z",
      endedAt: "2026-08-20T09:45:00.000Z",
    });

    await engine.updateSegmentTimes(segment!.id, { startedAt: "2026-08-20T08:50:00.000Z" });
    reread = await engine.segmentsFor(entry.id);
    expect(reread[0]).toMatchObject({
      startedAt: "2026-08-20T08:50:00.000Z",
      endedAt: "2026-08-20T09:45:00.000Z",
    });
  });
});

describe("TimerEngine.updateSegmentTimes — rejected edits", () => {
  it("rejects a start time at or after the segment's own end time with InvalidRangeError, and does not write it", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start();
    clock.advanceTo("2026-08-20T09:30:00.000Z");
    await engine.stop();
    const [segment] = await engine.segmentsFor(entry.id);

    await expect(engine.updateSegmentTimes(segment!.id, { startedAt: "2026-08-20T09:30:00.000Z" })).rejects.toThrow(
      InvalidRangeError,
    );
    // Rejected: the persisted row is unchanged.
    const reread = await engine.segmentsFor(entry.id);
    expect(reread[0]?.startedAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("rejects overlap with ANOTHER entry's segment on the same day", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);

    const first = await engine.start({ name: "Morning task" });
    clock.advanceTo("2026-08-20T09:30:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-20T10:00:00.000Z");
    const second = await engine.start({ name: "Later task" });
    clock.advanceTo("2026-08-20T10:30:00.000Z");
    await engine.stop();

    const [firstSegment] = await engine.segmentsFor(first.id);
    // Stretch the first entry's end into the second entry's range.
    await expect(
      engine.updateSegmentTimes(firstSegment!.id, { endedAt: "2026-08-20T10:15:00.000Z" }),
    ).rejects.toThrow(OverlapError);

    const reread = await engine.segmentsFor(first.id);
    expect(reread[0]?.endedAt).toBe("2026-08-20T09:30:00.000Z"); // unchanged

    // Sanity: the second entry's segment is untouched too.
    const secondReread = await engine.segmentsFor(second.id);
    expect(secondReread[0]?.startedAt).toBe("2026-08-20T10:00:00.000Z");
  });

  it("rejects overlap with the entry's OWN other segment (a paused/resumed multi-segment entry)", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start();
    clock.advanceTo("2026-08-20T09:20:00.000Z");
    await engine.pause();
    clock.advanceTo("2026-08-20T09:30:00.000Z");
    await engine.resume();
    clock.advanceTo("2026-08-20T09:45:00.000Z");
    await engine.stop();

    const segments = await engine.segmentsFor(entry.id);
    expect(segments).toHaveLength(2);
    // Push the second segment's start backward into the first segment's range.
    await expect(
      engine.updateSegmentTimes(segments[1]!.id, { startedAt: "2026-08-20T09:10:00.000Z" }),
    ).rejects.toThrow(OverlapError);
  });

  it("an edit that does not touch the segment's own range at all is never mistaken for overlapping itself", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start();
    clock.advanceTo("2026-08-20T09:30:00.000Z");
    await engine.stop();
    const [segment] = await engine.segmentsFor(entry.id);

    // Re-submitting the SAME start time must not self-reject.
    await expect(
      engine.updateSegmentTimes(segment!.id, { startedAt: "2026-08-20T09:00:00.000Z" }),
    ).resolves.toBeUndefined();
  });

  it("rejects editing the end time of a segment that is still open (running) with RunningSegmentEndNotEditableError", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start();
    const [segment] = await engine.segmentsFor(entry.id);

    await expect(
      engine.updateSegmentTimes(segment!.id, { endedAt: "2026-08-20T09:10:00.000Z" }),
    ).rejects.toThrow(RunningSegmentEndNotEditableError);

    // The start time of a running segment IS editable — only the end is not.
    await expect(
      engine.updateSegmentTimes(segment!.id, { startedAt: "2026-08-20T08:55:00.000Z" }),
    ).resolves.toBeUndefined();
    const reread = await engine.segmentsFor(entry.id);
    expect(reread[0]?.startedAt).toBe("2026-08-20T08:55:00.000Z");
    expect(reread[0]?.endedAt).toBeNull();
  });
});

describe("TimerEngine.deleteEntry / restoreEntry — byte-identical undo", () => {
  it("delete removes the entry and its segments; restoreEntry brings back byte-identical rows (same ids, same timestamps)", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
    clock.advanceTo("2026-08-20T09:20:00.000Z");
    await engine.pause();
    clock.advanceTo("2026-08-20T09:30:00.000Z");
    await engine.resume();
    clock.advanceTo("2026-08-20T09:45:00.000Z");
    await engine.stop();

    // Raw rows, read directly through the driver — not through the engine's
    // own mapped objects, so the "before" snapshot can't be biased by
    // whatever the engine's own read path happens to produce.
    const beforeEntryRows = await driver.select("SELECT * FROM time_entries WHERE id = ?", [entry.id]);
    const beforeSegmentRows = await driver.select("SELECT * FROM segments WHERE entry_id = ? ORDER BY started_at ASC", [
      entry.id,
    ]);
    expect(beforeSegmentRows).toHaveLength(2);

    const entryToRestore = (await engine.entry(entry.id))!;
    const segmentsToRestore = await engine.segmentsFor(entry.id);

    await engine.deleteEntry(entry.id);
    expect(await engine.entry(entry.id)).toBeNull();
    expect(await engine.segmentsFor(entry.id)).toHaveLength(0);

    await engine.restoreEntry(entryToRestore, segmentsToRestore);

    const afterEntryRows = await driver.select("SELECT * FROM time_entries WHERE id = ?", [entry.id]);
    const afterSegmentRows = await driver.select("SELECT * FROM segments WHERE entry_id = ? ORDER BY started_at ASC", [
      entry.id,
    ]);

    expect(afterEntryRows).toEqual(beforeEntryRows);
    expect(afterSegmentRows).toEqual(beforeSegmentRows);
  });

  it("restoreEntry after delete does not resurrect a different (new-id) row — the exact same segment ids come back", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    clock.advanceTo("2026-08-20T09:35:00.000Z");
    await engine.stop();
    const [originalSegment] = await engine.segmentsFor(entry.id);

    const savedEntry = (await engine.entry(entry.id))!;
    const savedSegments = await engine.segmentsFor(entry.id);
    await engine.deleteEntry(entry.id);
    await engine.restoreEntry(savedEntry, savedSegments);

    const [restoredSegment] = await engine.segmentsFor(entry.id);
    expect(restoredSegment?.id).toBe(originalSegment!.id);
  });

  it("refuses to delete the entry that is currently running or paused (CannotDeleteRunningEntryError)", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Still going" });

    await expect(engine.deleteEntry(entry.id)).rejects.toThrow(CannotDeleteRunningEntryError);
    expect(await engine.entry(entry.id)).not.toBeNull();

    await engine.pause();
    await expect(engine.deleteEntry(entry.id)).rejects.toThrow(CannotDeleteRunningEntryError);
  });

  it("a stopped entry (even if it was the most recent one) deletes cleanly", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start();
    clock.advanceTo("2026-08-20T09:10:00.000Z");
    await engine.stop();

    await expect(engine.deleteEntry(entry.id)).resolves.toBeUndefined();
    expect(await engine.entry(entry.id)).toBeNull();
  });
});

describe("TimerEngine editing — works on any day, not just today", () => {
  it("edits a segment belonging to a day far in the past", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-01-05T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Old task" });
    clock.advanceTo("2026-01-05T09:30:00.000Z");
    await engine.stop();
    clock.advanceTo("2026-08-22T12:00:00.000Z"); // "now" is months later

    const [segment] = await engine.segmentsFor(entry.id);
    await engine.updateSegmentTimes(segment!.id, { startedAt: "2026-01-05T09:05:00.000Z" });
    const reread = await engine.segmentsFor(entry.id);
    expect(reread[0]?.startedAt).toBe("2026-01-05T09:05:00.000Z");
  });
});
