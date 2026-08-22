// S12: exercises `SettingsController` against a REAL SQLite-backed
// `ShortcutController` (fake `ShortcutDriver`, same as
// `shortcutController.test.ts`/`panelWiring.test.ts`) and a real
// `ReminderController` (fake `NotificationDriver`, real `TimerEngine`,
// same as `reminderController.test.ts`) — not mocks of this project's own
// controllers, so a rebind/interval change is proven to actually reach the
// live objects, not just an internal field on `SettingsController`.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeNotificationDriver } from "../reminders/fakeNotificationDriver";
import { ReminderController } from "../reminders/reminderController";
import { getReminderMinutes } from "../reminders/reminderSettings";
import { createFakeShortcutDriver } from "../shortcuts/fakeShortcutDriver";
import { DEFAULT_ACCELERATORS, ShortcutController } from "../shortcuts/shortcutController";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { getAutostartSetting } from "./autostartSetting";
import { createFakeAutostartDriver } from "./fakeAutostartDriver";
import { getLanguageSetting } from "./languageSetting";
import { getShortcutSetting } from "./shortcutSettings";
import { SettingsController } from "./settingsController";
import { getThemeSetting } from "./themeSetting";
import { PINNED_UPDATE_URL } from "./updateOpener";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s12-settingscontroller-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

async function setup(options?: { failingAccelerators?: Set<string> }) {
  const driver = trackDriver(dbPath);
  const engine = await TimerEngine.create(driver, () => new Date("2026-08-22T09:00:00.000Z"));
  const shortcutDriver = createFakeShortcutDriver({ failingAccelerators: options?.failingAccelerators });
  const shortcuts = new ShortcutController({ driver: shortcutDriver, engine });
  await shortcuts.registerAll();
  const notificationDriver = createFakeNotificationDriver();
  const reminders = new ReminderController({ engine, driver: notificationDriver, locale: "en" });
  const autostart = createFakeAutostartDriver();
  const openUpdatePage = vi.fn(async () => {});
  const getVersion = vi.fn(async () => "0.1.0");

  const settings = await SettingsController.create({
    driver,
    shortcuts,
    reminders,
    autostart,
    openUpdatePage,
    getVersion,
  });

  return { driver, engine, shortcutDriver, shortcuts, reminders, autostart, openUpdatePage, getVersion, settings };
}

describe("SettingsController.create — initial state", () => {
  it("reflects the pinned default accelerators against a fresh database", async () => {
    const { settings } = await setup();
    expect(settings.state.shortcutPrimary).toBe(DEFAULT_ACCELERATORS.primary);
    expect(settings.state.shortcutStop).toBe(DEFAULT_ACCELERATORS.stop);
  });

  it("reflects the pinned reminder/language/theme defaults", async () => {
    const { settings } = await setup();
    expect(settings.state.reminderMinutes).toBe(60);
    expect(settings.state.language).toBe("system");
    expect(settings.state.theme).toBe("system");
  });

  it("reflects the version from the injected getVersion", async () => {
    const { settings } = await setup();
    expect(settings.state.version).toBe("0.1.0");
  });

  it("updateStatus starts idle", async () => {
    const { settings } = await setup();
    expect(settings.state.updateStatus).toBe("idle");
  });

  it("autostart defaults to true (decisions.md #29) against a fresh database, and reconciles the OS driver to match", async () => {
    const { settings, autostart } = await setup();
    expect(settings.state.autostart).toBe(true);
    expect(autostart.calls).toContain("enable");
    expect(autostart.calls).not.toContain("disable");
    expect(await autostart.isEnabled()).toBe(true);
  });

  it("reconciles the OS driver to disabled when the persisted setting is false", async () => {
    const driver = trackDriver(dbPath);
    const { setAutostartSetting } = await import("./autostartSetting");
    await setAutostartSetting(driver, false);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-22T09:00:00.000Z"));
    const shortcuts = new ShortcutController({ driver: createFakeShortcutDriver(), engine });
    await shortcuts.registerAll();
    const reminders = new ReminderController({ engine, driver: createFakeNotificationDriver(), locale: "en" });
    const autostart = createFakeAutostartDriver(/* initiallyEnabled */ true);

    const settings = await SettingsController.create({
      driver,
      shortcuts,
      reminders,
      autostart,
      openUpdatePage: vi.fn(async () => {}),
      getVersion: vi.fn(async () => "0.1.0"),
    });

    expect(settings.state.autostart).toBe(false);
    expect(autostart.calls).toContain("disable");
    expect(await autostart.isEnabled()).toBe(false);
  });

  it("applies the persisted reminder.minutes to the live ReminderController, not just its own state", async () => {
    const driver = trackDriver(dbPath);
    const { setReminderMinutes } = await import("../reminders/reminderSettings");
    await setReminderMinutes(driver, 15);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-22T09:00:00.000Z"));
    const shortcuts = new ShortcutController({ driver: createFakeShortcutDriver(), engine });
    await shortcuts.registerAll();
    const reminders = new ReminderController({ engine, driver: createFakeNotificationDriver(), locale: "en" });

    const settings = await SettingsController.create({
      driver,
      shortcuts,
      reminders,
      autostart: createFakeAutostartDriver(),
      openUpdatePage: vi.fn(async () => {}),
      getVersion: vi.fn(async () => "0.1.0"),
    });

    expect(settings.state.reminderMinutes).toBe(15);
    expect(reminders.minutes).toBe(15);
  });
});

describe("rebindShortcut", () => {
  it("persists the new accelerator AND drives the live ShortcutController.rebind()", async () => {
    const { settings, shortcuts, shortcutDriver, driver } = await setup();

    await settings.rebindShortcut("primary", "CmdOrCtrl+Shift+P");

    expect(settings.state.shortcutPrimary).toBe("CmdOrCtrl+Shift+P");
    expect(shortcuts.accelerator("primary")).toBe("CmdOrCtrl+Shift+P");
    expect(shortcutDriver.isRegistered("CmdOrCtrl+Shift+P")).toBe(true);
    expect(shortcutDriver.isRegistered(DEFAULT_ACCELERATORS.primary)).toBe(false);
    expect(await getShortcutSetting(driver, "primary")).toBe("CmdOrCtrl+Shift+P");
  });

  it("rebinding stop does not disturb the persisted or live primary accelerator", async () => {
    const { settings, driver } = await setup();
    await settings.rebindShortcut("stop", "CmdOrCtrl+Shift+O");
    expect(settings.state.shortcutPrimary).toBe(DEFAULT_ACCELERATORS.primary);
    expect(await getShortcutSetting(driver, "primary")).toBe(DEFAULT_ACCELERATORS.primary);
  });

  it("a failed OS registration surfaces as a warning — the shortcut-rebind failure state Settings.tsx must render", async () => {
    const { settings } = await setup({ failingAccelerators: new Set(["CmdOrCtrl+Shift+P"]) });

    await settings.rebindShortcut("primary", "CmdOrCtrl+Shift+P");

    expect(settings.state.shortcutWarnings).toHaveLength(1);
    expect(settings.state.shortcutWarnings[0]).toMatchObject({
      id: "primary",
      accelerator: "CmdOrCtrl+Shift+P",
      messageKey: "shortcuts.warning.primaryFailed",
    });
  });

  it("persists across a fresh read even after a failed registration (S3's own semantics: the attempt takes effect regardless)", async () => {
    const { settings, driver } = await setup({ failingAccelerators: new Set(["CmdOrCtrl+Shift+P"]) });
    await settings.rebindShortcut("primary", "CmdOrCtrl+Shift+P");
    expect(await getShortcutSetting(driver, "primary")).toBe("CmdOrCtrl+Shift+P");
  });

  it("fires onStateChange with the updated warnings", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-22T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver({ failingAccelerators: new Set(["CmdOrCtrl+Shift+P"]) });
    const shortcuts = new ShortcutController({ driver: shortcutDriver, engine });
    await shortcuts.registerAll();
    const reminders = new ReminderController({ engine, driver: createFakeNotificationDriver(), locale: "en" });
    const onStateChange = vi.fn();
    const settings = await SettingsController.create({
      driver,
      shortcuts,
      reminders,
      autostart: createFakeAutostartDriver(),
      openUpdatePage: vi.fn(async () => {}),
      getVersion: vi.fn(async () => "0.1.0"),
      onStateChange,
    });

    await settings.rebindShortcut("primary", "CmdOrCtrl+Shift+P");

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ shortcutWarnings: expect.arrayContaining([expect.objectContaining({ id: "primary" })]) }),
    );
  });
});

describe("setReminderMinutes", () => {
  it("persists AND updates the live ReminderController's interval", async () => {
    const { settings, reminders, driver } = await setup();
    await settings.setReminderMinutes(30);
    expect(settings.state.reminderMinutes).toBe(30);
    expect(reminders.minutes).toBe(30);
    expect(await getReminderMinutes(driver)).toBe(30);
  });

  it("0 persists and reads back as 0 — 'off' round-trips like any other value", async () => {
    const { settings, reminders, driver } = await setup();
    await settings.setReminderMinutes(0);
    expect(settings.state.reminderMinutes).toBe(0);
    expect(reminders.minutes).toBe(0);
    expect(await getReminderMinutes(driver)).toBe(0);
  });
});

describe("setLanguage / setTheme", () => {
  it("persists language", async () => {
    const { settings, driver } = await setup();
    await settings.setLanguage("es");
    expect(settings.state.language).toBe("es");
    expect(await getLanguageSetting(driver)).toBe("es");
  });

  it("persists theme", async () => {
    const { settings, driver } = await setup();
    await settings.setTheme("dark");
    expect(settings.state.theme).toBe("dark");
    expect(await getThemeSetting(driver)).toBe("dark");
  });
});

describe("setAutostart", () => {
  it("persists AND reconciles the OS driver immediately, not just at next boot", async () => {
    const { settings, autostart, driver } = await setup();
    await settings.setAutostart(false);
    expect(settings.state.autostart).toBe(false);
    expect(await autostart.isEnabled()).toBe(false);
    expect(await getAutostartSetting(driver)).toBe(false);
  });
});

describe("checkForUpdates", () => {
  it("invokes the injected opener with the PINNED update URL — an opener call, never a network request", async () => {
    const { settings, openUpdatePage } = await setup();
    await settings.checkForUpdates();
    expect(openUpdatePage).toHaveBeenCalledTimes(1);
    // Asserted against a LITERAL, not against PINNED_UPDATE_URL itself.
    // Importing the constant and comparing the code to its own value is
    // tautological: it proves the wiring but passes for ANY url, so it
    // cannot detect a wrong one — which is exactly what "invokes the opener
    // with the pinned URL" is asking. Caught by a drill that changed the
    // constant to https://example.com/wrong and stayed green.
    //
    // If this literal ever needs to change, that is a deliberate decision
    // about where users are sent, and it should require editing a test.
    expect(openUpdatePage).toHaveBeenCalledWith(
      "https://github.com/benshapyro/tiny-time-tool/releases/latest",
    );
    // Kept as a consistency check between the two: the constant the app
    // exports and the literal this test pins must agree.
    expect(PINNED_UPDATE_URL).toBe("https://github.com/benshapyro/tiny-time-tool/releases/latest");
    expect(settings.state.updateStatus).toBe("opened");
  });

  it("sets updateStatus 'error' rather than throwing when the opener rejects", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-22T09:00:00.000Z"));
    const shortcuts = new ShortcutController({ driver: createFakeShortcutDriver(), engine });
    await shortcuts.registerAll();
    const reminders = new ReminderController({ engine, driver: createFakeNotificationDriver(), locale: "en" });
    const settings = await SettingsController.create({
      driver,
      shortcuts,
      reminders,
      autostart: createFakeAutostartDriver(),
      openUpdatePage: vi.fn(async () => {
        throw new Error("no default browser");
      }),
      getVersion: vi.fn(async () => "0.1.0"),
    });

    await expect(settings.checkForUpdates()).resolves.toBeUndefined();
    expect(settings.state.updateStatus).toBe("error");
  });
});
