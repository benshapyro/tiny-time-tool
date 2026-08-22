// S4: proves the real glue between S3's `ShortcutController` and the S4
// `QuickEntryController` — the composition `bootstrap.ts` wires for real
// (against live Tauri drivers) is exercised here against the fake shortcut
// driver + a real SQLite-backed TimerEngine, exactly like
// `shortcutController.test.ts`. This is the "wiring: the S3 primary
// handler from idle opens this panel" acceptance check, plus the other
// opening-rules acceptance checks that depend on BOTH controllers acting
// together (BUILD_SPEC S4 "the S3/S4 interplay").

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ACCELERATORS, ShortcutController } from "../shortcuts/shortcutController";
import { createFakeShortcutDriver } from "../shortcuts/fakeShortcutDriver";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { QuickEntryController } from "./quickEntryController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s4-wiring-"));
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

/** Wires a `ShortcutController` + `QuickEntryController` together exactly
 * the way `src/app/bootstrap.ts` wires the real ones — S3's two seams
 * (`onPanelOpenRequested`, `onBeforePause`) driving S4's controller. */
function wire(engine: TimerEngine, clockNow: () => Date, driver = createFakeShortcutDriver()) {
  const panel = new QuickEntryController({ engine, locale: "en", clock: clockNow });
  const shortcuts = new ShortcutController({
    driver,
    engine,
    onPanelOpenRequested: () => panel.openForNaming(),
    onBeforePause: () => panel.commitIfOpen(),
  });
  return { panel, shortcuts, driver };
}

describe("wiring: the S3 primary handler from idle opens this panel", () => {
  it("primary from idle starts the entry AND opens the panel for naming", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const { panel, shortcuts, driver: shortcutDriver } = wire(engine, () => new Date("2026-08-21T09:00:00.000Z"));
    await shortcuts.registerAll();

    expect(panel.state.mode).toBe("closed");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary);
    expect(engine.state).toBe("running");
    expect(panel.state.mode).toBe("naming");
  });
});

describe("primary while running with panel closed pauses without opening the panel", () => {
  it("commits nothing (nothing typed) and simply pauses — the panel stays closed throughout", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const { panel, shortcuts, driver: shortcutDriver } = wire(engine, () => new Date("2026-08-21T09:00:00.000Z"));
    await shortcuts.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // idle -> running, opens panel
    await panel.commit(); // user committed and closed it themselves (e.g. pressed Enter)
    expect(panel.state.mode).toBe("closed");

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // running -> paused
    expect(engine.state).toBe("paused");
    expect(panel.state.mode).toBe("closed"); // never reopened
  });
});

describe("re-press-while-open commits text then pauses", () => {
  it("a second primary press while the panel is still open commits the typed text, then pauses", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const { panel, shortcuts, driver: shortcutDriver } = wire(engine, clock.now);
    await shortcuts.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // idle -> running, opens panel
    expect(panel.state.mode).toBe("naming");
    const entryId = engine.currentEntryId;

    panel.updateText("Acme onboarding @acme #rollout");
    clock.advanceTo("2026-08-21T10:03:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // primary again, panel still open

    expect(engine.state).toBe("paused"); // committed, then paused
    expect(panel.state.mode).toBe("closed");
    const updated = await engine.entry(entryId!);
    expect(updated).toMatchObject({ name: "Acme onboarding", client: "acme", project: "rollout" });
  });
});

describe("keyboard-only switch = stop shortcut, then primary", () => {
  it("stopping the running entry then pressing primary starts a fresh one and reopens the panel for naming", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const { panel, shortcuts, driver: shortcutDriver } = wire(engine, clock.now);
    await shortcuts.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start entry 1
    const firstEntryId = engine.currentEntryId;
    await panel.commit(); // name it and close the panel, as a real user would before switching
    clock.advanceTo("2026-08-21T09:10:00.000Z");

    await shortcutDriver.press(DEFAULT_ACCELERATORS.stop); // stop entry 1
    expect(engine.state).toBe("idle");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start entry 2

    expect(engine.state).toBe("running");
    expect(engine.currentEntryId).not.toBe(firstEntryId);
    expect(panel.state.mode).toBe("naming"); // reopened for the new entry
  });
});
