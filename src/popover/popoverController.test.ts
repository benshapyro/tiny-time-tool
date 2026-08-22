// S5: business logic for the tray popover (BUILD_SPEC S5 row). Exercised
// against a real SQLite-backed TimerEngine (never a mock), same convention
// as `panelWiring.test.ts` / `timerEngine.test.ts`. Acceptance checks
// covered here: seeded fixture day -> 3 entries + correct total "2h 05m";
// empty state -> teach line naming the shortcut; paused entry -> distinct
// status from running and from stopped; Switch delegates to the
// `switchAction()` seam rather than duplicating its logic.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AwayGapController } from "../away/awayGapController";
import { setLastHeartbeat } from "../away/heartbeatStore";
import { DEFAULT_ACCELERATORS } from "../shortcuts/shortcutController";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { PopoverController } from "./popoverController";
import { currentAcceleratorPlatform, formatAccelerator } from "../shortcuts/formatAccelerator";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s5-popover-"));
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

describe("PopoverController — day view", () => {
  it("seeded fixture day: 3 stopped entries render with the correct summed total 2h 05m", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);

    // 45m + 45m + 35m = 2h 05m
    await engine.start({ name: "Acme onboarding" });
    clock.advanceTo("2026-08-21T09:45:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-21T10:00:00.000Z");
    await engine.start({ name: "Beta review" });
    clock.advanceTo("2026-08-21T10:45:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-21T13:00:00.000Z");
    await engine.start({ name: "Deep work" });
    clock.advanceTo("2026-08-21T13:35:00.000Z");
    await engine.stop();

    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    expect(controller.state.entries).toHaveLength(3);
    expect(controller.state.entries.map((e) => e.name)).toEqual(["Acme onboarding", "Beta review", "Deep work"]);
    expect(controller.state.entries.map((e) => e.durationLabel)).toEqual(["45m", "45m", "35m"]);
    expect(controller.state.entries.every((e) => e.status === "stopped")).toBe(true);
    expect(controller.state.totalLabel).toBe("2h 05m");
    expect(controller.state.teachLine).toBeNull();
  });

  it("empty state renders the teach line naming the primary shortcut", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    });

    await controller.refresh();

    expect(controller.state.entries).toHaveLength(0);
    // The teach line must name the shortcut in HUMAN form. It used to
    // interpolate the raw accelerator, so first launch greeted users with
    // "Press CmdOrCtrl+Shift+Space…" — a Tauri token, not a key on any
    // keyboard (S5 design-review finding).
    const line = controller.state.teachLine ?? "";
    expect(line).not.toContain("CmdOrCtrl");
    expect(line).toBe(
      `Press ${formatAccelerator(DEFAULT_ACCELERATORS.primary, currentAcceleratorPlatform(), "en")} to start tracking`,
    );
  });

  it("empty state teach line in es is idiomatic and also names the shortcut", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new PopoverController({
      engine,
      locale: "es",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    });

    await controller.refresh();

    expect(controller.state.teachLine ?? "").not.toContain("CmdOrCtrl");
    expect(controller.state.teachLine ?? "").toContain(
      formatAccelerator(DEFAULT_ACCELERATORS.primary, currentAcceleratorPlatform(), "es"),
    );
    expect(controller.state.teachLine).not.toMatch(/rastreando/i);
  });

  it("the currently-running entry is tagged 'running'; every other entry that day is 'stopped'", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Earlier task" });
    clock.advanceTo("2026-08-21T09:30:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-21T10:00:00.000Z");
    await engine.start({ name: "Current task" });
    clock.advanceTo("2026-08-21T10:05:00.000Z"); // 5 minutes elapsed so far

    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    const earlier = controller.state.entries.find((e) => e.name === "Earlier task");
    const current = controller.state.entries.find((e) => e.name === "Current task");
    expect(earlier?.status).toBe("stopped");
    expect(current?.status).toBe("running");
    expect(controller.state.timerStatus).toBe("running");
    expect(controller.state.elapsedSeconds).toBe(5 * 60);
  });

  it("the currently-paused entry is tagged 'paused' — distinct from both 'running' and 'stopped'", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Current task" });
    clock.advanceTo("2026-08-21T09:10:00.000Z");
    await engine.pause();

    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    expect(controller.state.entries[0]?.status).toBe("paused");
    expect(controller.state.timerStatus).toBe("paused");
    // Three genuinely distinct values, not a two-state boolean in disguise.
    const allStatuses = new Set(["running", "paused", "stopped"]);
    expect(allStatuses.has(controller.state.entries[0]!.status)).toBe(true);
  });

  it("entries from a different day are excluded from both the list and the total", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Yesterday task" });
    clock.advanceTo("2026-08-21T10:00:00.000Z");
    await engine.stop();

    clock.advanceTo("2026-08-22T09:00:00.000Z");
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    expect(controller.state.entries).toHaveLength(0);
    expect(controller.state.totalLabel).toBe("0m");
  });
});

describe("PopoverController — actions", () => {
  it("start() transitions idle -> running and refreshes the view", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    await controller.start();

    expect(engine.state).toBe("running");
    expect(controller.state.timerStatus).toBe("running");
    expect(controller.state.entries).toHaveLength(1);
  });

  it("pause() then resume() round-trip through the controller and the engine agree", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.start();

    await controller.pause();
    expect(engine.state).toBe("paused");
    expect(controller.state.timerStatus).toBe("paused");

    await controller.resume();
    expect(engine.state).toBe("running");
    expect(controller.state.timerStatus).toBe("running");
  });

  it("stop() returns to idle with no current entry", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.start();

    await controller.stop();

    expect(engine.state).toBe("idle");
    expect(controller.state.timerStatus).toBe("idle");
    expect(controller.state.elapsedSeconds).toBe(0);
  });

  it("switchTask() delegates to the injected onSwitch callback rather than duplicating S4's stop-then-start logic", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const onSwitch = vi.fn();
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
      onSwitch,
    });
    await controller.start();

    await controller.switchTask();

    expect(onSwitch).toHaveBeenCalledTimes(1);
    // The controller itself does not stop/start the engine — that is the
    // panel commit's job, later, in a different window.
    expect(engine.state).toBe("running");
  });

  it("onStateChange fires with every state update", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const onStateChange = vi.fn();
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      onStateChange,
    });

    await controller.refresh();

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(controller.state);
  });
});

// Regression for the S5 review finding: popover actions drove the engine but
// nothing reached the tray, so pressing Start in the popover left the tray
// icon on Idle and pressing Stop left it ticking on a stopped timer. The
// shortcut path had this wired; the popover path never did. No existing test
// caught it because the controller was only ever exercised in isolation.
// S9: away-gap recovery surfaces in the popover (BUILD_SPEC S9's cross-
// surface obligation — an away-gap trim mutates a persisted entry and
// changes timer state, exactly like S7's edits/deletes, so the popover
// must learn about it the same way). `AwayGapController` is optional on
// `PopoverControllerOptions`; when absent, `awayPrompt` is always null —
// existing callers/tests above never construct one and must keep passing.
describe("PopoverController — away-gap prompt", () => {
  it("awayPrompt is null when no AwayGapController is wired at all", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    });

    await controller.refresh();

    expect(controller.state.awayPrompt).toBeNull();
  });

  it("surfaces a localized 'Away Xh Ym — add it back?' message once the away controller has a pending prompt", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z"); // 9h12m gap
    const awayGap = new AwayGapController({ engine, driver, clock: clock.now });
    await awayGap.check();

    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
      awayGap,
    });
    await controller.refresh();

    expect(controller.state.awayPrompt).not.toBeNull();
    expect(controller.state.awayPrompt?.entryId).toBe(entry.id);
    expect(controller.state.awayPrompt?.message).toBe("Away 9h 12m — add it back?");
  });

  it("es locale renders the idiomatic message, never a raw token", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    await (await TimerEngine.create(driver, clock.now)).start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const awayGap = new AwayGapController({ engine, driver, clock: clock.now });
    await awayGap.check();

    const controller = new PopoverController({
      engine,
      locale: "es",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
      awayGap,
    });
    await controller.refresh();

    expect(controller.state.awayPrompt?.message).toBe("Ausente 9h 12m — ¿lo recuperamos?");
  });

  it("awayKeep() delegates to the away controller, then refreshes — the entry returns to running", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const awayGap = new AwayGapController({ engine, driver, clock: clock.now });
    await awayGap.check();
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
      awayGap,
    });
    await controller.refresh();
    expect(controller.state.timerStatus).toBe("paused");

    await controller.awayKeep();

    expect(engine.state).toBe("running");
    expect(controller.state.timerStatus).toBe("running");
    expect(controller.state.awayPrompt).toBeNull();
  });

  it("awayDiscard() delegates to the away controller, then refreshes — the entry stays paused and trimmed", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const awayGap = new AwayGapController({ engine, driver, clock: clock.now });
    await awayGap.check();
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
      awayGap,
    });
    await controller.refresh();

    await controller.awayDiscard();

    expect(engine.state).toBe("paused");
    expect(controller.state.timerStatus).toBe("paused");
    expect(controller.state.awayPrompt).toBeNull();
  });

  it("calling awayKeep()/awayDiscard() with no pending prompt is a safe no-op", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const awayGap = new AwayGapController({ engine, driver });
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      awayGap,
    });
    await controller.refresh();

    await expect(controller.awayKeep()).resolves.not.toThrow();
    await expect(controller.awayDiscard()).resolves.not.toThrow();
    expect(controller.state.awayPrompt).toBeNull();
  });
});

describe("PopoverController — tray stays in sync with popover actions", () => {
  it("reports a tray state for every action, not just for shortcut-driven ones", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const seen: string[] = [];
    const controller = new PopoverController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      onTrayStateChange: (state) => seen.push(state),
    });

    await controller.start();
    await controller.pause();
    await controller.resume();
    await controller.stop();

    expect(seen).toEqual(["running", "paused", "running", "idle"]);
  });
});
