// S9: away-gap recovery (BUILD_SPEC S9 row). Exercised against a real
// SQLite-backed TimerEngine (never a mock), same convention as every other
// controller test in this project. Acceptance checks covered here: a
// fixture heartbeat log with a 9h12m gap trims the entry at the last
// heartbeat and queues the prompt; a 3m gap changes nothing; boundary
// fixtures at exactly 5m00s (ignored) and 5m01s (triggers); a kill-9
// relaunch reusing the 9h12m fixture trims the entry and queues the same
// prompt (same "abandoned, unclosed driver" pattern firstLaunchFlag.test.ts
// uses for its own restart case).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { AWAY_GAP_THRESHOLD_MS, AwayGapController } from "./awayGapController";
import { getLastHeartbeat, setLastHeartbeat } from "./heartbeatStore";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s9-awaygap-"));
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

describe("AWAY_GAP_THRESHOLD_MS", () => {
  it("is the pinned 5-minute default", () => {
    expect(AWAY_GAP_THRESHOLD_MS).toBe(5 * 60 * 1000);
  });
});

describe("AwayGapController.check — the pinned 9h12m fixture", () => {
  it("trims the entry retroactively at the last heartbeat and queues the prompt", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");

    // 9h12m pass with no intervening heartbeat — the process was asleep or
    // killed for that whole span.
    clock.advanceTo("2026-08-21T18:12:00.000Z");

    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    expect(engine.state).toBe("paused");
    const [segment] = await engine.segmentsFor(entry.id);
    expect(segment?.endedAt).toBe("2026-08-21T09:00:00.000Z"); // trimmed to the LAST HEARTBEAT, not now
    expect(await engine.durationSeconds(entry.id)).toBe(0); // heartbeat == start time here

    expect(controller.prompt).not.toBeNull();
    expect(controller.prompt?.entryId).toBe(entry.id);
    expect(controller.prompt?.awaySeconds).toBe(9 * 3600 + 12 * 60);
  });

  it("a 3m gap changes nothing — no trim, no prompt, still running", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");

    clock.advanceTo("2026-08-21T09:03:00.000Z");

    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    expect(engine.state).toBe("running");
    const [segment] = await engine.segmentsFor(entry.id);
    expect(segment?.endedAt).toBeNull();
    expect(controller.prompt).toBeNull();
    // The heartbeat itself DOES advance on an ignored gap — every tick
    // re-stamps "still alive" so the NEXT gap is measured from here, not
    // from the original start.
    expect(await getLastHeartbeat(driver)).toBe("2026-08-21T09:03:00.000Z");
  });
});

describe("AwayGapController.check — the boundary is strict", () => {
  it("a gap of EXACTLY 5m00s is ignored", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");

    clock.advanceTo("2026-08-21T09:05:00.000Z"); // exactly 300,000ms

    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    expect(engine.state).toBe("running");
    expect(controller.prompt).toBeNull();
  });

  it("a gap of 5m01s TRIGGERS", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");

    clock.advanceTo("2026-08-21T09:05:01.000Z"); // exactly 301,000ms

    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    expect(engine.state).toBe("paused");
    expect(controller.prompt).not.toBeNull();
  });
});

describe("AwayGapController.check — no heartbeat yet (fresh start)", () => {
  it("falls back to the segment's own start time as the floor, not to a stale/missing heartbeat", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    // No setLastHeartbeat call at all — the 30s ticker hasn't fired yet.

    clock.advanceTo("2026-08-21T19:00:00.000Z"); // 10h since start, no heartbeat ever written

    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    expect(engine.state).toBe("paused");
    expect(controller.prompt?.entryId).toBe(entry.id);
    expect(controller.prompt?.awaySeconds).toBe(10 * 3600);
  });

  it("a stale heartbeat from a PREVIOUS, cleanly-stopped entry never counts against a freshly started one", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Earlier task" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T09:10:00.000Z");
    await engine.stop(); // cleanly stopped; heartbeat row is now 10m stale

    clock.advanceTo("2026-08-21T12:00:00.000Z");
    const entry = await engine.start({ name: "New task" }); // fresh segment, starts NOW

    clock.advanceTo("2026-08-21T12:02:00.000Z"); // only 2m since the new start

    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    expect(engine.state).toBe("running"); // must NOT trigger off the stale 3h-old heartbeat
    expect(controller.prompt).toBeNull();
    void entry;
  });
});

describe("AwayGapController.check — gated on 'running'", () => {
  it("a manually paused entry sitting for hours is left alone — no trigger, no prompt", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T09:10:00.000Z");
    await engine.pause(); // a deliberate, manual pause — not an away gap

    clock.advanceTo("2026-08-21T20:00:00.000Z"); // 10+ hours later, still paused

    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    expect(engine.state).toBe("paused");
    expect(controller.prompt).toBeNull();
  });

  it("idle (no current entry) is a no-op", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new AwayGapController({ engine, driver, clock: () => new Date("2026-08-21T09:00:00.000Z") });

    await expect(controller.check()).resolves.not.toThrow();
    expect(controller.prompt).toBeNull();
  });
});

describe("AwayGapController — kill -9 relaunch reuses the launch-time check path", () => {
  it("a fresh engine+controller against the same DB file, at launch, reconstructs the identical trim and prompt", async () => {
    const dbClock = fixedClock("2026-08-21T09:00:00.000Z");
    const driver1 = trackDriver(dbPath);
    const engine1 = await TimerEngine.create(driver1, dbClock.now);
    const entry = await engine1.start({ name: "Deep work" });
    await setLastHeartbeat(driver1, "2026-08-21T09:00:00.000Z");
    // driver1/engine1 abandoned here, unclosed — exactly like a killed
    // process. No pause()/stop() ever ran, so the segment is still open on
    // disk.

    // "Relaunch": a brand-new driver + a brand-new engine (rehydrated from
    // the still-open segment) + a brand-new controller, 9h12m later.
    const relaunchClock = fixedClock("2026-08-21T18:12:00.000Z");
    const driver2 = trackDriver(dbPath);
    const engine2 = await TimerEngine.create(driver2, relaunchClock.now);
    expect(engine2.state).toBe("running"); // rehydrated as running, per S2

    const controller2 = new AwayGapController({ engine: engine2, driver: driver2, clock: relaunchClock.now });
    await controller2.check(); // the "once at app launch" call

    expect(engine2.state).toBe("paused");
    const [segment] = await engine2.segmentsFor(entry.id);
    expect(segment?.endedAt).toBe("2026-08-21T09:00:00.000Z");
    expect(controller2.prompt?.entryId).toBe(entry.id);
    expect(controller2.prompt?.awaySeconds).toBe(9 * 3600 + 12 * 60);
  });
});

describe("AwayGapController.keep", () => {
  it("reopens the trimmed segment, returns to running, and clears the prompt", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();
    expect(controller.prompt).not.toBeNull();

    clock.advanceTo("2026-08-21T18:15:00.000Z"); // a few minutes to decide
    await controller.keep();

    expect(engine.state).toBe("running");
    expect(controller.prompt).toBeNull();
    const [segment] = await engine.segmentsFor(entry.id);
    expect(segment?.endedAt).toBeNull();
    // The away span is back IN — duration counts all the way to "now".
    expect(await engine.durationSeconds(entry.id)).toBe(9 * 3600 + 15 * 60);
  });

  it("is a safe no-op when there is no pending prompt", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new AwayGapController({ engine, driver });

    await expect(controller.keep()).resolves.not.toThrow();
  });

  it("resets the heartbeat so the VERY NEXT tick does not immediately re-trigger", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();
    await controller.keep();

    clock.advanceTo("2026-08-21T18:12:30.000Z"); // one ordinary 30s tick later
    await controller.check();

    expect(engine.state).toBe("running"); // must NOT have re-triggered off the stale pre-keep heartbeat
    expect(controller.prompt).toBeNull();
  });

  it("notifies onEngineMutated", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const onEngineMutated = vi.fn();
    const controller = new AwayGapController({ engine, driver, clock: clock.now, onEngineMutated });
    await controller.check();
    onEngineMutated.mockClear(); // only asserting keep()'s own call below

    await controller.keep();

    expect(onEngineMutated).toHaveBeenCalledTimes(1);
  });
});

describe("AwayGapController.discard", () => {
  it("leaves the entry trimmed and paused, and clears the prompt", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const entry = await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const controller = new AwayGapController({ engine, driver, clock: clock.now });
    await controller.check();

    controller.discard();
    // Flush a full macrotask, not just one microtask hop: `discard()` must
    // not even fire-and-forget an engine mutation. One `await` on an async
    // call of similar shape isn't guaranteed to outrace a same-shaped
    // fire-and-forget call started earlier — a real `setTimeout` tick is.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.prompt).toBeNull();
    expect(engine.state).toBe("paused"); // still paused — discard does not auto-resume
    const [segment] = await engine.segmentsFor(entry.id);
    expect(segment?.endedAt).toBe("2026-08-21T09:00:00.000Z"); // still trimmed
  });

  it("does NOT notify onEngineMutated — nothing further changed in the engine", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const onEngineMutated = vi.fn();
    const controller = new AwayGapController({ engine, driver, clock: clock.now, onEngineMutated });
    await controller.check();
    onEngineMutated.mockClear();

    controller.discard();

    expect(onEngineMutated).not.toHaveBeenCalled();
  });

  it("is a safe no-op when there is no pending prompt", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new AwayGapController({ engine, driver });

    expect(() => controller.discard()).not.toThrow();
    expect(controller.prompt).toBeNull();
  });
});

describe("AwayGapController.check — onStateChange / onEngineMutated on trigger", () => {
  it("fires onStateChange with the new prompt and onEngineMutated when a gap triggers", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T18:12:00.000Z");
    const onStateChange = vi.fn();
    const onEngineMutated = vi.fn();
    const controller = new AwayGapController({ engine, driver, clock: clock.now, onStateChange, onEngineMutated });

    await controller.check();

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(controller.prompt);
    expect(onEngineMutated).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire either callback when a gap is ignored", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Deep work" });
    await setLastHeartbeat(driver, "2026-08-21T09:00:00.000Z");
    clock.advanceTo("2026-08-21T09:03:00.000Z");
    const onStateChange = vi.fn();
    const onEngineMutated = vi.fn();
    const controller = new AwayGapController({ engine, driver, clock: clock.now, onStateChange, onEngineMutated });

    await controller.check();

    expect(onStateChange).not.toHaveBeenCalled();
    expect(onEngineMutated).not.toHaveBeenCalled();
  });
});
