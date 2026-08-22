// S5: "On first launch the popover auto-opens once" — and it must survive
// restart (a second real process must never auto-open it again). Exercised
// against a real SQLite file (via testSqliteSupport/nodeSqliteDriver), not
// an in-memory mock, matching this project's persistence-testing convention
// (S2's TimerEngine restart tests do the same).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { consumeFirstLaunch } from "./firstLaunchFlag";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s5-firstlaunch-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("consumeFirstLaunch", () => {
  it("returns true exactly once against a fresh database", async () => {
    const driver = trackDriver(dbPath);
    expect(await consumeFirstLaunch(driver)).toBe(true);
    expect(await consumeFirstLaunch(driver)).toBe(false);
    expect(await consumeFirstLaunch(driver)).toBe(false);
  });

  it("persists across a simulated restart — a fresh driver against the same file never sees true again", async () => {
    const driver1 = trackDriver(dbPath);
    expect(await consumeFirstLaunch(driver1)).toBe(true);
    // driver1 is abandoned here, unclosed, exactly like a killed process —
    // nothing below references it again.

    const driver2 = trackDriver(dbPath);
    expect(await consumeFirstLaunch(driver2)).toBe(false);
  });

  it("a fresh database file (different path) still returns true — the flag is per-database, not global", async () => {
    const otherDbPath = join(tempDir, "other.db");
    const driver = trackDriver(otherDbPath);
    expect(await consumeFirstLaunch(driver)).toBe(true);
  });
});
