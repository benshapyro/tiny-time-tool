// Exercises TimerEngine against a REAL SQLite file in a temp dir (via
// nodeSqliteDriver), not an in-memory mock — BUILD_SPEC S2 requires
// persistence to be genuinely exercised, and "rehydrate on relaunch" is
// tested by constructing a fresh TimerEngine against the same file, never
// touching the first instance again (the honest CI-safe analogue of
// kill -9 + relaunch).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entryDayKey } from "./dayAttribution";
import { closeTrackedDrivers, trackDriver } from "./testSqliteSupport";
import { IllegalTransitionError, TimerEngine } from "./timerEngine";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s2-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

/** A controllable clock for deterministic tests — never wall-clock/sleep. */
function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    advanceTo: (nextIso: string) => {
      current = new Date(nextIso);
    },
  };
}

describe("TimerEngine", () => {
  it("pinned fixture sequence: start(10:00) -> pause(10:20) -> resume(10:30) -> stop(10:45) yields 35m across two segments", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);

    const entry = await engine.start({ name: "Acme onboarding" });
    expect(engine.state).toBe("running");

    clock.advanceTo("2026-08-21T10:20:00.000Z");
    await engine.pause();
    expect(engine.state).toBe("paused");

    clock.advanceTo("2026-08-21T10:30:00.000Z");
    await engine.resume();
    expect(engine.state).toBe("running");

    clock.advanceTo("2026-08-21T10:45:00.000Z");
    await engine.stop();
    expect(engine.state).toBe("idle");

    const segments = await engine.segmentsFor(entry.id);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      startedAt: "2026-08-21T10:00:00.000Z",
      endedAt: "2026-08-21T10:20:00.000Z",
    });
    expect(segments[1]).toMatchObject({
      startedAt: "2026-08-21T10:30:00.000Z",
      endedAt: "2026-08-21T10:45:00.000Z",
    });

    expect(await engine.durationSeconds(entry.id)).toBe(35 * 60);
  });

  it("duration = sum of segments, with an open segment counted to `now` from the injected clock", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);

    const entry = await engine.start();
    clock.advanceTo("2026-08-21T09:12:00.000Z");
    expect(await engine.durationSeconds(entry.id)).toBe(12 * 60);

    clock.advanceTo("2026-08-21T09:20:00.000Z");
    await engine.pause();
    // Once paused, elapsed time is frozen at the pause point, regardless of
    // how much further `now` moves.
    clock.advanceTo("2026-08-21T09:45:00.000Z");
    expect(await engine.durationSeconds(entry.id)).toBe(20 * 60);
  });

  describe("illegal transitions (documented semantics: start only from idle, pause only from running, resume only from paused, stop from running or paused)", () => {
    it("rejects resume() from idle", async () => {
      const driver = trackDriver(dbPath);
      const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
      await expect(engine.resume()).rejects.toThrow(IllegalTransitionError);
    });

    it("rejects pause() from idle", async () => {
      const driver = trackDriver(dbPath);
      const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
      await expect(engine.pause()).rejects.toThrow(IllegalTransitionError);
    });

    it("rejects pause() when already paused", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);
      await engine.start();
      await engine.pause();
      await expect(engine.pause()).rejects.toThrow(IllegalTransitionError);
    });

    it("rejects start() while running", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);
      await engine.start();
      await expect(engine.start()).rejects.toThrow(IllegalTransitionError);
    });

    it("rejects start() while paused", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);
      await engine.start();
      await engine.pause();
      await expect(engine.start()).rejects.toThrow(IllegalTransitionError);
    });

    it("rejects stop() from idle", async () => {
      const driver = trackDriver(dbPath);
      const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
      await expect(engine.stop()).rejects.toThrow(IllegalTransitionError);
    });

    it("allows stop() directly from paused (no resume required)", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);
      const entry = await engine.start();
      clock.advanceTo("2026-08-21T09:10:00.000Z");
      await engine.pause();
      await engine.stop();
      expect(engine.state).toBe("idle");
      expect(await engine.durationSeconds(entry.id)).toBe(10 * 60);
    });
  });

  it("rehydrates a running entry from disk when a fresh engine is constructed against the same database file", async () => {
    const clock1 = fixedClock("2026-08-21T09:00:00.000Z");
    const driver1 = trackDriver(dbPath);
    const engine1 = await TimerEngine.create(driver1, clock1.now);
    const entry = await engine1.start({ name: "Deep work" });
    clock1.advanceTo("2026-08-21T09:05:00.000Z");
    // No stop(), no close(): engine1/driver1 are abandoned here, exactly as
    // a killed process would abandon its in-memory state. Nothing below
    // references them again.

    const clock2 = fixedClock("2026-08-21T09:18:00.000Z");
    const driver2 = trackDriver(dbPath);
    const engine2 = await TimerEngine.create(driver2, clock2.now);

    expect(engine2.state).toBe("running");
    expect(engine2.currentEntryId).toBe(entry.id);
    expect(await engine2.durationSeconds(entry.id)).toBe(18 * 60);
  });

  it("rehydrates idle (no open segment) as idle, not running", async () => {
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const driver1 = trackDriver(dbPath);
    const engine1 = await TimerEngine.create(driver1, clock.now);
    await engine1.start();
    clock.advanceTo("2026-08-21T09:10:00.000Z");
    await engine1.stop();

    const driver2 = trackDriver(dbPath);
    const engine2 = await TimerEngine.create(driver2, () => new Date("2026-08-21T09:15:00.000Z"));
    expect(engine2.state).toBe("idle");
    expect(engine2.currentEntryId).toBeNull();
  });

  it("stores name: null as NULL in the database — never bakes in the display auto-name", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start(); // no name/client/project given

    expect(entry.name).toBeNull();
    expect(entry.client).toBeNull();
    expect(entry.project).toBeNull();

    const rows = await driver.select<{ name: string | null; client: string | null; project: string | null }>(
      "SELECT name, client, project FROM time_entries WHERE id = ?",
      [entry.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBeNull();
    expect(rows[0]?.client).toBeNull();
    expect(rows[0]?.project).toBeNull();
  });

  it("BUILD_SPEC overnight fixture: 23:30 start -> 00:45 stop belongs only to the start day, duration 1h 15m", async () => {
    const driver = trackDriver(dbPath);
    const start = new Date(2026, 7, 21, 23, 30, 0);
    const end = new Date(2026, 7, 22, 0, 45, 0);
    const clock = fixedClock(start.toISOString());
    const engine = await TimerEngine.create(driver, clock.now);

    const entry = await engine.start({ name: "Overnight incident" });
    clock.advanceTo(end.toISOString());
    await engine.stop();

    const segments = await engine.segmentsFor(entry.id);
    expect(segments).toHaveLength(1); // not split across two days

    const firstSegment = segments[0];
    expect(firstSegment).toBeDefined();
    const day = entryDayKey(firstSegment!.startedAt);
    expect(day).toBe(entryDayKey(start.toISOString()));
    expect(day).not.toBe(entryDayKey(end.toISOString()));

    expect(await engine.durationSeconds(entry.id)).toBe(75 * 60);
  });

  describe("setEntryFields (S4: naming an entry after it has already started — tracking begins at the shortcut press, naming happens later via the quick-entry panel)", () => {
    it("updates name/client/project on an already-started entry without disturbing its segments", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T10:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);
      const entry = await engine.start(); // no fields yet — matches a bare shortcut press
      expect(entry.name).toBeNull();

      clock.advanceTo("2026-08-21T10:00:07.000Z"); // naming happens moments later
      await engine.setEntryFields(entry.id, { name: "Acme onboarding", client: "acme", project: "rollout" });

      const updated = await engine.entry(entry.id);
      expect(updated).toMatchObject({ name: "Acme onboarding", client: "acme", project: "rollout" });

      // The segment recorded at start() is untouched by naming.
      const segments = await engine.segmentsFor(entry.id);
      expect(segments).toHaveLength(1);
      expect(segments[0]?.startedAt).toBe("2026-08-21T10:00:00.000Z");
    });

    it("setting an empty/null name explicitly clears it back to NULL (Enter with empty input skips naming)", async () => {
      const driver = trackDriver(dbPath);
      const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T10:00:00.000Z"));
      const entry = await engine.start({ name: "placeholder" });

      await engine.setEntryFields(entry.id, { name: null, client: null, project: null });

      const updated = await engine.entry(entry.id);
      expect(updated?.name).toBeNull();
      expect(updated?.client).toBeNull();
      expect(updated?.project).toBeNull();
    });
  });

  describe("recentTaskNames (S4: autocomplete data source)", () => {
    it("returns distinct non-null names, most recently created first, capped at the given limit", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);

      await engine.start({ name: "Acme onboarding" });
      await engine.stop();
      clock.advanceTo("2026-08-21T09:05:00.000Z");
      await engine.start({ name: "Acme deep-dive" });
      await engine.stop();
      clock.advanceTo("2026-08-21T09:10:00.000Z");
      await engine.start({ name: "Beta review" });
      await engine.stop();
      clock.advanceTo("2026-08-21T09:15:00.000Z");
      await engine.start({ name: "Acme onboarding" }); // duplicate name — not repeated
      await engine.stop();
      clock.advanceTo("2026-08-21T09:20:00.000Z");
      await engine.start(); // null name — excluded
      await engine.stop();

      const names = await engine.recentTaskNames(10);
      expect(names).toEqual(["Acme onboarding", "Beta review", "Acme deep-dive"]);
    });

    it("caps results at the given limit", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);
      for (const name of ["One", "Two", "Three"]) {
        await engine.start({ name });
        await engine.stop();
        clock.advanceTo(new Date(clock.now().getTime() + 60_000).toISOString());
      }
      const names = await engine.recentTaskNames(2);
      expect(names).toHaveLength(2);
    });
  });

  describe("entriesForDay (S5: the popover's today-view data source — day attribution by first segment's local start day)", () => {
    it("returns only entries attributed to the given day, in creation order, each with its segments", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);

      const first = await engine.start({ name: "Morning standup" });
      clock.advanceTo("2026-08-21T09:15:00.000Z");
      await engine.stop();

      clock.advanceTo("2026-08-21T13:00:00.000Z");
      const second = await engine.start({ name: "Acme onboarding" });
      clock.advanceTo("2026-08-21T14:00:00.000Z");
      await engine.stop();

      // A different day — must not appear in the 8/21 view.
      clock.advanceTo("2026-08-22T09:00:00.000Z");
      await engine.start({ name: "Next-day task" });
      await engine.stop();

      const day = entryDayKey("2026-08-21T09:00:00.000Z");
      const rows = await engine.entriesForDay(day);

      expect(rows).toHaveLength(2);
      expect(rows[0]?.entry.id).toBe(first.id);
      expect(rows[0]?.segments).toHaveLength(1);
      expect(rows[1]?.entry.id).toBe(second.id);
    });

    it("returns an empty array for a day with no entries", async () => {
      const driver = trackDriver(dbPath);
      const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
      const rows = await engine.entriesForDay("2026-08-21");
      expect(rows).toEqual([]);
    });

    it("includes the currently-running entry (an open segment counts to the day of its start)", async () => {
      const driver = trackDriver(dbPath);
      const clock = fixedClock("2026-08-21T09:00:00.000Z");
      const engine = await TimerEngine.create(driver, clock.now);
      const entry = await engine.start({ name: "Deep work" });

      const rows = await engine.entriesForDay(entryDayKey("2026-08-21T09:00:00.000Z"));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.entry.id).toBe(entry.id);
      expect(rows[0]?.segments[0]?.endedAt).toBeNull();
    });

    it("BUILD_SPEC overnight fixture: an entry starting 23:30 and still open belongs only to the start day", async () => {
      const driver = trackDriver(dbPath);
      const start = new Date(2026, 7, 21, 23, 30, 0);
      const engine = await TimerEngine.create(driver, () => start);
      await engine.start({ name: "Overnight incident" });

      const startDay = entryDayKey(start.toISOString());
      const nextDay = entryDayKey(new Date(2026, 7, 22, 0, 45, 0).toISOString());

      expect(await engine.entriesForDay(startDay)).toHaveLength(1);
      expect(await engine.entriesForDay(nextDay)).toHaveLength(0);
    });
  });
});
