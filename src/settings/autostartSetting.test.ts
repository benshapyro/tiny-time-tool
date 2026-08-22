import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { DEFAULT_AUTOSTART, getAutostartSetting, setAutostartSetting } from "./autostartSetting";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s12-autostart-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("DEFAULT_AUTOSTART", () => {
  it("is true — decisions.md #29 pins launch-at-login default ON", () => {
    expect(DEFAULT_AUTOSTART).toBe(true);
  });
});

describe("getAutostartSetting", () => {
  it("returns true against a fresh database with no row (default ON, not the usual boolean-false default)", async () => {
    const driver = trackDriver(dbPath);
    expect(await getAutostartSetting(driver)).toBe(true);
  });

  it("returns the pinned default when the stored value isn't 'true' or 'false'", async () => {
    const driver = trackDriver(dbPath);
    await driver.execute("INSERT INTO settings (key, value) VALUES (?, ?)", ["autostart", "yes"]);
    expect(await getAutostartSetting(driver)).toBe(true);
  });
});

describe("setAutostartSetting / getAutostartSetting round trip", () => {
  it("persists false (the user explicitly disabling it) and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setAutostartSetting(driver, false);
    expect(await getAutostartSetting(driver)).toBe(false);
  });

  it("persists true and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setAutostartSetting(driver, false);
    await setAutostartSetting(driver, true);
    expect(await getAutostartSetting(driver)).toBe(true);
  });

  it("a second write for the same key overwrites rather than throwing a UNIQUE-constraint error", async () => {
    const driver = trackDriver(dbPath);
    await setAutostartSetting(driver, true);
    await setAutostartSetting(driver, false);
    expect(await getAutostartSetting(driver)).toBe(false);
  });
});
