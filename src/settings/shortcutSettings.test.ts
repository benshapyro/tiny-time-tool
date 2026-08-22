import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ACCELERATORS } from "../shortcuts/shortcutController";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { getShortcutSetting, setShortcutSetting } from "./shortcutSettings";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s12-shortcutsettings-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("getShortcutSetting", () => {
  it("returns the pinned default primary accelerator against a fresh database", async () => {
    const driver = trackDriver(dbPath);
    expect(await getShortcutSetting(driver, "primary")).toBe(DEFAULT_ACCELERATORS.primary);
  });

  it("returns the pinned default stop accelerator against a fresh database", async () => {
    const driver = trackDriver(dbPath);
    expect(await getShortcutSetting(driver, "stop")).toBe(DEFAULT_ACCELERATORS.stop);
  });

  it("falls back to the default when the stored value is empty", async () => {
    const driver = trackDriver(dbPath);
    await driver.execute("INSERT INTO settings (key, value) VALUES (?, ?)", ["shortcut.primary", ""]);
    expect(await getShortcutSetting(driver, "primary")).toBe(DEFAULT_ACCELERATORS.primary);
  });
});

describe("setShortcutSetting / getShortcutSetting round trip", () => {
  it("persists a rebound primary accelerator and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setShortcutSetting(driver, "primary", "CmdOrCtrl+Shift+P");
    expect(await getShortcutSetting(driver, "primary")).toBe("CmdOrCtrl+Shift+P");
  });

  it("persists a rebound stop accelerator independently of primary", async () => {
    const driver = trackDriver(dbPath);
    await setShortcutSetting(driver, "primary", "CmdOrCtrl+Shift+P");
    await setShortcutSetting(driver, "stop", "CmdOrCtrl+Shift+O");
    expect(await getShortcutSetting(driver, "primary")).toBe("CmdOrCtrl+Shift+P");
    expect(await getShortcutSetting(driver, "stop")).toBe("CmdOrCtrl+Shift+O");
  });

  it("a second write for the same id overwrites rather than throwing a UNIQUE-constraint error", async () => {
    const driver = trackDriver(dbPath);
    await setShortcutSetting(driver, "primary", "CmdOrCtrl+Shift+P");
    await setShortcutSetting(driver, "primary", "CmdOrCtrl+Shift+Q");
    expect(await getShortcutSetting(driver, "primary")).toBe("CmdOrCtrl+Shift+Q");
  });
});
