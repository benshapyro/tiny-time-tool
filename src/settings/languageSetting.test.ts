// S12: exercised against a real SQLite file, not a mock — same convention
// as `firstLaunchFlag.test.ts` / `reminderSettings.test.ts`.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { DEFAULT_LANGUAGE_SETTING, getLanguageSetting, setLanguageSetting } from "./languageSetting";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s12-language-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("DEFAULT_LANGUAGE_SETTING", () => {
  it("is 'system' — BUILD_SPEC pins language to follow the OS by default", () => {
    expect(DEFAULT_LANGUAGE_SETTING).toBe("system");
  });
});

describe("getLanguageSetting", () => {
  it("returns the pinned default against a fresh database with no row", async () => {
    const driver = trackDriver(dbPath);
    expect(await getLanguageSetting(driver)).toBe("system");
  });

  it("returns the pinned default when the stored value isn't a recognized language setting", async () => {
    const driver = trackDriver(dbPath);
    await driver.execute("INSERT INTO settings (key, value) VALUES (?, ?)", ["language", "fr"]);
    expect(await getLanguageSetting(driver)).toBe("system");
  });
});

describe("setLanguageSetting / getLanguageSetting round trip", () => {
  it("persists 'en' and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setLanguageSetting(driver, "en");
    expect(await getLanguageSetting(driver)).toBe("en");
  });

  it("persists 'es' and reads it back", async () => {
    const driver = trackDriver(dbPath);
    await setLanguageSetting(driver, "es");
    expect(await getLanguageSetting(driver)).toBe("es");
  });

  it("a second write for the same key overwrites rather than throwing a UNIQUE-constraint error", async () => {
    const driver = trackDriver(dbPath);
    await setLanguageSetting(driver, "en");
    await setLanguageSetting(driver, "es");
    expect(await getLanguageSetting(driver)).toBe("es");
  });

  it("can be set back to 'system' explicitly", async () => {
    const driver = trackDriver(dbPath);
    await setLanguageSetting(driver, "en");
    await setLanguageSetting(driver, "system");
    expect(await getLanguageSetting(driver)).toBe("system");
  });
});
