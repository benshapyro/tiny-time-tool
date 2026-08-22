// S10: `TimerEngine.entriesForRange` — CSV/JSON export's date-range data
// source (BUILD_SPEC S10 row: "CSV by date range"). Same real-SQLite
// pattern as timerEngine.test.ts; kept in its own file rather than appended
// to that one so this slice's tests are easy to find and re-run in
// isolation.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "./testSqliteSupport";
import { TimerEngine } from "./timerEngine";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s10-range-"));
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

describe("TimerEngine.entriesForRange", () => {
  it("returns entries across multiple days within an inclusive range, sorted chronologically", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-20T16:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);

    await engine.start({ name: "day 20" });
    clock.advanceTo("2026-08-20T17:00:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-22T16:00:00.000Z");
    await engine.start({ name: "day 22" });
    clock.advanceTo("2026-08-22T17:00:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-21T16:00:00.000Z"); // out-of-DB-order creation, still day 21
    await engine.start({ name: "day 21" });
    clock.advanceTo("2026-08-21T17:00:00.000Z");
    await engine.stop();

    const rows = await engine.entriesForRange("2026-08-20", "2026-08-22");
    expect(rows.map((r) => r.entry.name)).toEqual(["day 20", "day 21", "day 22"]);
  });

  it("excludes days outside the range at both boundaries", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-19T16:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);

    await engine.start({ name: "before range" });
    clock.advanceTo("2026-08-19T17:00:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-21T16:00:00.000Z");
    await engine.start({ name: "in range" });
    clock.advanceTo("2026-08-21T17:00:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-23T16:00:00.000Z");
    await engine.start({ name: "after range" });
    clock.advanceTo("2026-08-23T17:00:00.000Z");
    await engine.stop();

    const rows = await engine.entriesForRange("2026-08-20", "2026-08-22");
    expect(rows.map((r) => r.entry.name)).toEqual(["in range"]);
  });

  it("a single-day range (start === end) behaves like entriesForDay", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "only entry" });
    clock.advanceTo("2026-08-21T17:00:00.000Z");
    await engine.stop();

    const viaRange = await engine.entriesForRange("2026-08-21", "2026-08-21");
    const viaDay = await engine.entriesForDay("2026-08-21");
    expect(viaRange.map((r) => r.entry.id)).toEqual(viaDay.map((r) => r.entry.id));
  });
});
