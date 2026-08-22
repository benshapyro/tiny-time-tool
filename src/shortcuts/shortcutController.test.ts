// S3: global shortcuts -> TimerEngine wiring (BUILD_SPEC S3 row).
//
// Playwright cannot drive native Tauri windows, so "a shortcut was pressed"
// is simulated via `fakeShortcutDriver`'s `press()`, which invokes whatever
// handler `ShortcutController` registered for that accelerator — the
// CI-safe analogue of a real OS key event (BUILD_SPEC's pinned testing
// strategy). Business logic (the shortcut -> TimerEngine mapping, warning
// state, rebind) lives in `ShortcutController`, unit-testable without a
// native harness, per the architecture constraint.
//
// Exercises against a REAL SQLite file in a temp dir via `nodeSqliteDriver`
// (same pattern as `timerEngine.test.ts`), not an in-memory mock, so the
// full stack under test — shortcut handler -> TimerEngine -> SqlDriver —
// is genuine.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import type { TrayState } from "../tray/trayState";
import { formatElapsed, trayTitleForState } from "../tray/trayTitle";
import { createFakeShortcutDriver } from "./fakeShortcutDriver";
import { DEFAULT_ACCELERATORS, ShortcutController } from "./shortcutController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s3-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

/** A controllable clock for deterministic tests — never wall-clock/sleep,
 * same helper `timerEngine.test.ts` uses. */
function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    advanceTo: (nextIso: string) => {
      current = new Date(nextIso);
    },
  };
}

describe("DEFAULT_ACCELERATORS", () => {
  it("are exactly the pinned strings (BUILD_SPEC Settings keys shortcut.primary / shortcut.stop)", () => {
    expect(DEFAULT_ACCELERATORS.primary).toBe("CmdOrCtrl+Shift+Space");
    expect(DEFAULT_ACCELERATORS.stop).toBe("CmdOrCtrl+Shift+Alt+Space");
  });
});

describe("ShortcutController acceptance: registered handlers drive TimerEngine through the pinned fixture sequence", () => {
  it("primary(10:00) start -> primary(10:20) pause -> primary(10:30) resume -> stop(10:45) yields 35m across two segments", async () => {
    const sqlDriver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(sqlDriver, clock.now);
    const shortcutDriver = createFakeShortcutDriver();
    const controller = new ShortcutController({ driver: shortcutDriver, engine });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start
    expect(engine.state).toBe("running");
    const entryId = engine.currentEntryId;
    expect(entryId).not.toBeNull();

    clock.advanceTo("2026-08-21T10:20:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // pause
    expect(engine.state).toBe("paused");

    clock.advanceTo("2026-08-21T10:30:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // resume
    expect(engine.state).toBe("running");

    clock.advanceTo("2026-08-21T10:45:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.stop); // stop
    expect(engine.state).toBe("idle");

    const segments = await engine.segmentsFor(entryId!);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      startedAt: "2026-08-21T10:00:00.000Z",
      endedAt: "2026-08-21T10:20:00.000Z",
    });
    expect(segments[1]).toMatchObject({
      startedAt: "2026-08-21T10:30:00.000Z",
      endedAt: "2026-08-21T10:45:00.000Z",
    });
    expect(await engine.durationSeconds(entryId!)).toBe(35 * 60);
  });

  it("stop accelerator stops directly from paused (no resume required first)", async () => {
    const sqlDriver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(sqlDriver, clock.now);
    const shortcutDriver = createFakeShortcutDriver();
    const controller = new ShortcutController({ driver: shortcutDriver, engine });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start
    clock.advanceTo("2026-08-21T09:10:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // pause
    expect(engine.state).toBe("paused");

    await shortcutDriver.press(DEFAULT_ACCELERATORS.stop); // stop
    expect(engine.state).toBe("idle");
  });

  it("a stray stop press while idle is a no-op, not a thrown IllegalTransitionError", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver();
    const controller = new ShortcutController({ driver: shortcutDriver, engine });
    await controller.registerAll();

    await expect(shortcutDriver.press(DEFAULT_ACCELERATORS.stop)).resolves.toBeUndefined();
    expect(engine.state).toBe("idle");
  });
});

describe("panel-open seam (S3/S4 interplay: primary-from-idle opens the panel, pause never does)", () => {
  it("fires onPanelOpenRequested exactly once, on the idle -> running (start) transition", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver();
    let panelOpenCount = 0;
    const controller = new ShortcutController({
      driver: shortcutDriver,
      engine,
      onPanelOpenRequested: () => {
        panelOpenCount += 1;
      },
    });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // idle -> running
    expect(panelOpenCount).toBe(1);
  });

  it("does NOT fire onPanelOpenRequested when primary pauses a running timer (S3's toggle is sacred)", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver();
    let panelOpenCount = 0;
    const controller = new ShortcutController({
      driver: shortcutDriver,
      engine,
      onPanelOpenRequested: () => {
        panelOpenCount += 1;
      },
    });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // idle -> running (opens panel)
    expect(panelOpenCount).toBe(1);

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // running -> paused
    expect(panelOpenCount).toBe(1); // unchanged — pause must not open the panel
    expect(engine.state).toBe("paused");
  });

  it("does NOT fire onPanelOpenRequested on resume (paused -> running)", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver();
    let panelOpenCount = 0;
    const controller = new ShortcutController({
      driver: shortcutDriver,
      engine,
      onPanelOpenRequested: () => {
        panelOpenCount += 1;
      },
    });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // pause
    expect(panelOpenCount).toBe(1);

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // resume
    expect(panelOpenCount).toBe(1);
    expect(engine.state).toBe("running");
  });
});

describe("tray feedback seam (2026-08-22 amendment: pause is visible, not silent)", () => {
  it("drives the tray-state model to paused with the S1 pause-glyph + elapsed title on primary-while-running", async () => {
    const sqlDriver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(sqlDriver, clock.now);
    const shortcutDriver = createFakeShortcutDriver();
    const trayUpdates: Array<{ state: TrayState; elapsedSeconds: number }> = [];
    const controller = new ShortcutController({
      driver: shortcutDriver,
      engine,
      onTrayStateChange: (state, elapsedSeconds) => {
        trayUpdates.push({ state, elapsedSeconds });
      },
    });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start at 10:00
    clock.advanceTo("2026-08-21T10:20:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // pause at 10:20 -> 20m elapsed

    const last = trayUpdates[trayUpdates.length - 1];
    expect(last?.state).toBe("paused");
    expect(last?.elapsedSeconds).toBe(20 * 60);
    // Reuses S1's own helpers — not reimplemented here.
    expect(trayTitleForState(last!.state, last!.elapsedSeconds)).toBe(`⏸ ${formatElapsed(20 * 60)}`);
    expect(trayTitleForState(last!.state, last!.elapsedSeconds)).toBe("⏸ 20:00");
  });

  it("drives the tray-state model to running on start and on resume", async () => {
    const sqlDriver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(sqlDriver, clock.now);
    const shortcutDriver = createFakeShortcutDriver();
    const trayUpdates: Array<{ state: TrayState; elapsedSeconds: number }> = [];
    const controller = new ShortcutController({
      driver: shortcutDriver,
      engine,
      onTrayStateChange: (state, elapsedSeconds) => {
        trayUpdates.push({ state, elapsedSeconds });
      },
    });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // idle -> running
    expect(trayUpdates[trayUpdates.length - 1]).toMatchObject({ state: "running" });

    clock.advanceTo("2026-08-21T10:05:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // running -> paused
    clock.advanceTo("2026-08-21T10:07:00.000Z");
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // paused -> running
    expect(trayUpdates[trayUpdates.length - 1]).toMatchObject({ state: "running", elapsedSeconds: 5 * 60 });
  });

  it("drives the tray-state model to idle on stop", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T10:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver();
    const trayUpdates: Array<{ state: TrayState; elapsedSeconds: number }> = [];
    const controller = new ShortcutController({
      driver: shortcutDriver,
      engine,
      onTrayStateChange: (state, elapsedSeconds) => {
        trayUpdates.push({ state, elapsedSeconds });
      },
    });
    await controller.registerAll();

    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start
    await shortcutDriver.press(DEFAULT_ACCELERATORS.stop); // stop
    expect(trayUpdates[trayUpdates.length - 1]).toMatchObject({ state: "idle" });
  });
});

describe("failed registration surfaces a visible warning (no silent failure)", () => {
  it("sets a warning naming the accelerator that failed to register; the other accelerator is unaffected", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver({
      failingAccelerators: new Set([DEFAULT_ACCELERATORS.stop]),
    });
    const controller = new ShortcutController({ driver: shortcutDriver, engine });

    await controller.registerAll();

    expect(controller.hasWarning).toBe(true);
    expect(controller.warnings).toHaveLength(1);
    const warning = controller.warnings[0];
    expect(warning?.id).toBe("stop");
    expect(warning?.accelerator).toBe(DEFAULT_ACCELERATORS.stop);
    expect(warning?.messageKey).toBe("shortcuts.warning.stopFailed");
    expect(warning?.driverError.length).toBeGreaterThan(0);

    // The primary accelerator registered fine — no warning for it, and it
    // still works.
    expect(controller.warnings.some((w) => w.id === "primary")).toBe(false);
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary);
    expect(engine.state).toBe("running");
  });

  it("clears the warning once registration succeeds", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const failing = new Set([DEFAULT_ACCELERATORS.primary]);
    const shortcutDriver = createFakeShortcutDriver({ failingAccelerators: failing });
    const controller = new ShortcutController({ driver: shortcutDriver, engine });

    await controller.registerAll();
    expect(controller.hasWarning).toBe(true);

    failing.delete(DEFAULT_ACCELERATORS.primary); // external conflict resolved
    await controller.registerAll(); // retry
    expect(controller.hasWarning).toBe(false);
    expect(controller.warnings).toHaveLength(0);
  });

  it("both accelerators can fail independently and both are reported", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver({
      failingAccelerators: new Set([DEFAULT_ACCELERATORS.primary, DEFAULT_ACCELERATORS.stop]),
    });
    const controller = new ShortcutController({ driver: shortcutDriver, engine });

    await controller.registerAll();

    expect(controller.warnings).toHaveLength(2);
    expect(controller.warnings.map((w) => w.id).sort()).toEqual(["primary", "stop"]);
  });
});

describe("rebind path (S12 seam)", () => {
  it("after a failure, rebinding to a different accelerator registers it and clears the warning", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const shortcutDriver = createFakeShortcutDriver({
      failingAccelerators: new Set([DEFAULT_ACCELERATORS.stop]),
    });
    const controller = new ShortcutController({ driver: shortcutDriver, engine });
    await controller.registerAll();
    expect(controller.hasWarning).toBe(true);

    const rebound = "CmdOrCtrl+Shift+Alt+P";
    await controller.rebind("stop", rebound);

    expect(controller.hasWarning).toBe(false);
    expect(controller.accelerator("stop")).toBe(rebound);
    expect(shortcutDriver.isRegistered(rebound)).toBe(true);
    expect(shortcutDriver.isRegistered(DEFAULT_ACCELERATORS.stop)).toBe(false);

    // The rebound accelerator now actually drives the engine.
    await shortcutDriver.press(DEFAULT_ACCELERATORS.primary); // start
    await shortcutDriver.press(rebound); // stop via the new accelerator
    expect(engine.state).toBe("idle");
  });

  it("rebinding to another accelerator that also fails keeps (re-targets) the warning", async () => {
    const sqlDriver = trackDriver(dbPath);
    const engine = await TimerEngine.create(sqlDriver, () => new Date("2026-08-21T09:00:00.000Z"));
    const alsoTaken = "CmdOrCtrl+Shift+Alt+P";
    const shortcutDriver = createFakeShortcutDriver({
      failingAccelerators: new Set([DEFAULT_ACCELERATORS.stop, alsoTaken]),
    });
    const controller = new ShortcutController({ driver: shortcutDriver, engine });
    await controller.registerAll();

    await controller.rebind("stop", alsoTaken);

    expect(controller.hasWarning).toBe(true);
    const warning = controller.warnings.find((w) => w.id === "stop");
    expect(warning?.accelerator).toBe(alsoTaken);
  });
});
