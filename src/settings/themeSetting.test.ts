import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { DEFAULT_THEME_SETTING, getThemeSetting, setThemeSetting } from "./themeSetting";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s12-theme-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("DEFAULT_THEME_SETTING", () => {
  it("is 'system' — matches tokens.css's existing OS-sync default", () => {
    expect(DEFAULT_THEME_SETTING).toBe("system");
  });
});

describe("getThemeSetting", () => {
  it("returns the pinned default against a fresh database with no row", async () => {
    const driver = trackDriver(dbPath);
    expect(await getThemeSetting(driver)).toBe("system");
  });

  it("returns the pinned default when the stored value isn't a recognized theme", async () => {
    const driver = trackDriver(dbPath);
    await driver.execute("INSERT INTO settings (key, value) VALUES (?, ?)", ["theme", "solarized"]);
    expect(await getThemeSetting(driver)).toBe("system");
  });
});

describe("setThemeSetting / getThemeSetting round trip", () => {
  it("persists 'light' and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setThemeSetting(driver, "light");
    expect(await getThemeSetting(driver)).toBe("light");
  });

  it("persists 'dark' and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setThemeSetting(driver, "dark");
    expect(await getThemeSetting(driver)).toBe("dark");
  });

  it("a second write for the same key overwrites rather than throwing a UNIQUE-constraint error", async () => {
    const driver = trackDriver(dbPath);
    await setThemeSetting(driver, "light");
    await setThemeSetting(driver, "dark");
    expect(await getThemeSetting(driver)).toBe("dark");
  });
});
