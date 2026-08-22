// S8: `reminder.minutes` is a pinned settings key (BUILD_SPEC "Pinned
// interfaces" -> Settings keys: "reminder.minutes (60, 0=off)"). Persisted
// in the existing `settings` key-value table (migration 0002_settings.sql,
// the same seam `firstLaunchFlag.ts` already uses) rather than a new table.
// Exercised against a real SQLite file, not a mock — same convention as
// `firstLaunchFlag.test.ts`.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { DEFAULT_REMINDER_MINUTES, getReminderMinutes, setReminderMinutes } from "./reminderSettings";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s8-settings-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("DEFAULT_REMINDER_MINUTES", () => {
  it("is the pinned default of 60", () => {
    expect(DEFAULT_REMINDER_MINUTES).toBe(60);
  });
});

describe("getReminderMinutes", () => {
  it("returns the pinned default (60) against a fresh database with no row", async () => {
    const driver = trackDriver(dbPath);
    expect(await getReminderMinutes(driver)).toBe(60);
  });
});

describe("setReminderMinutes / getReminderMinutes round trip", () => {
  it("persists a custom interval and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setReminderMinutes(driver, 15);
    expect(await getReminderMinutes(driver)).toBe(15);
  });

  it("persists 0 (off) — the falsy value must round-trip, not fall back to the default", async () => {
    const driver = trackDriver(dbPath);
    await setReminderMinutes(driver, 0);
    expect(await getReminderMinutes(driver)).toBe(0);
  });

  it("updating an already-set value overwrites it (upsert, not a UNIQUE-constraint failure)", async () => {
    const driver = trackDriver(dbPath);
    await setReminderMinutes(driver, 60);
    await setReminderMinutes(driver, 30);
    await setReminderMinutes(driver, 15);
    expect(await getReminderMinutes(driver)).toBe(15);
  });

  it("persists across a simulated restart — a fresh driver against the same file reads the same value", async () => {
    const driver1 = trackDriver(dbPath);
    await setReminderMinutes(driver1, 30);
    // driver1 abandoned unclosed, exactly like a killed process.

    const driver2 = trackDriver(dbPath);
    expect(await getReminderMinutes(driver2)).toBe(30);
  });

  it("does not disturb an unrelated settings row (e.g. popover.autoOpened)", async () => {
    const driver = trackDriver(dbPath);
    await driver.execute("INSERT INTO settings (key, value) VALUES (?, ?)", ["popover.autoOpened", "true"]);
    await setReminderMinutes(driver, 15);
    const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [
      "popover.autoOpened",
    ]);
    expect(rows[0]?.value).toBe("true");
  });
});
