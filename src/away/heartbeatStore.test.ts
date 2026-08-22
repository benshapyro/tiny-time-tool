// S9: plumbing test for the `away.lastHeartbeat` settings row — same
// convention as reminderSettings.test.ts / firstLaunchFlag.test.ts.
// Exercised against a real SQLite file, never a mock.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { clearLastHeartbeat, getLastHeartbeat, setLastHeartbeat } from "./heartbeatStore";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s9-heartbeat-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("getLastHeartbeat", () => {
  it("returns null against a fresh database with no row", async () => {
    const driver = trackDriver(dbPath);
    expect(await getLastHeartbeat(driver)).toBeNull();
  });
});

describe("setLastHeartbeat / getLastHeartbeat round trip", () => {
  it("persists a timestamp and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    expect(await getLastHeartbeat(driver)).toBe("2026-08-21T09:00:00.000Z");
  });

  it("updating an already-set value overwrites it (upsert, not a UNIQUE-constraint failure)", async () => {
    const driver = trackDriver(dbPath);
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    await setLastHeartbeat(driver, "2026-08-21T09:00:30.000Z");
    await setLastHeartbeat(driver, "2026-08-21T09:01:00.000Z");
    expect(await getLastHeartbeat(driver)).toBe("2026-08-21T09:01:00.000Z");
  });

  it("persists across a simulated restart — a fresh driver against the same file reads the same value", async () => {
    const driver1 = trackDriver(dbPath);
    await setLastHeartbeat(driver1, "2026-08-21T09:00:00.000Z");
    // driver1 abandoned unclosed, exactly like a killed process.

    const driver2 = trackDriver(dbPath);
    expect(await getLastHeartbeat(driver2)).toBe("2026-08-21T09:00:00.000Z");
  });

  it("does not disturb an unrelated settings row (e.g. reminder.minutes)", async () => {
    const driver = trackDriver(dbPath);
    await driver.execute("INSERT INTO settings (key, value) VALUES (?, ?)", ["reminder.minutes", "30"]);
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [
      "reminder.minutes",
    ]);
    expect(rows[0]?.value).toBe("30");
  });
});

describe("clearLastHeartbeat", () => {
  it("removes the stored row so a later read returns null again", async () => {
    const driver = trackDriver(dbPath);
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    await clearLastHeartbeat(driver);
    expect(await getLastHeartbeat(driver)).toBeNull();
  });

  it("is a safe no-op when nothing was ever stored", async () => {
    const driver = trackDriver(dbPath);
    await expect(clearLastHeartbeat(driver)).resolves.not.toThrow();
  });
});
