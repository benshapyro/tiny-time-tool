// S8: reminders — interval nudge while a timer runs, clicking it opens the
// popover (BUILD_SPEC S8 row). Exercised against a REAL SQLite-backed
// TimerEngine (never a mock), same convention as `shortcutController.test.ts`
// / `popoverController.test.ts` — the full stack under test is
// `ReminderController` -> `TimerEngine` -> `SqlDriver`, with only the OS
// notification bridge itself stubbed (`fakeNotificationDriver.ts`), per
// BUILD_SPEC's pinned testing strategy: "CI runners have no notification
// permission, and real OS click delivery can't be synthesized."
//
// Everything here uses a mocked clock via `tick()` calls — never `sleep` —
// per the coordinator's explicit instruction ("Test the exact count with a
// mocked clock, never sleep").

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { createFakeNotificationDriver } from "./fakeNotificationDriver";
import { ReminderController } from "./reminderController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s8-reminders-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

/** A controllable clock for deterministic tests — never wall-clock/sleep,
 * same helper `timerEngine.test.ts` / `shortcutController.test.ts` use. */
function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    advanceTo: (nextIso: string) => {
      current = new Date(nextIso);
    },
  };
}

async function setup(options: { minutes?: number } = {}) {
  const driver = trackDriver(dbPath);
  const clock = fixedClock("2026-08-21T09:00:00.000Z");
  const engine = await TimerEngine.create(driver, clock.now);
  const notificationDriver = createFakeNotificationDriver();
  const onOpenPopover = vi.fn();
  const controller = new ReminderController({
    engine,
    driver: notificationDriver,
    locale: "en",
    clock: clock.now,
    minutes: options.minutes,
    onOpenPopover,
  });
  return { driver, clock, engine, notificationDriver, onOpenPopover, controller };
}

describe("ReminderController — default interval (60m, BUILD_SPEC pinned default)", () => {
  it("headline acceptance: a running timer with 60m elapsed (mocked clock) fires exactly one notify call", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start({ name: "Acme onboarding" });

    clock.advanceTo("2026-08-21T10:00:00.000Z"); // +60m
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(1);
    expect(notificationDriver.calls[0]?.title.length).toBeGreaterThan(0);
    expect(notificationDriver.calls[0]?.body).toContain("Acme onboarding");
    expect(notificationDriver.calls[0]?.body).toContain("1h 00m");
  });

  it("does not fire before the interval elapses", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start({ name: "Acme onboarding" });

    clock.advanceTo("2026-08-21T09:59:59.000Z"); // 1s short of 60m
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(0);
  });

  it("boundary: repeated ticks at the exact same elapsed instant fire exactly once, not once per tick", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start();

    clock.advanceTo("2026-08-21T10:00:00.000Z");
    await controller.tick();
    await controller.tick();
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(1);
  });

  it("a repeating interval polling every 30s across the boundary still fires exactly once", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start();

    for (const iso of [
      "2026-08-21T09:59:00.000Z",
      "2026-08-21T09:59:30.000Z",
      "2026-08-21T10:00:00.000Z",
      "2026-08-21T10:00:30.000Z",
      "2026-08-21T10:01:00.000Z",
    ]) {
      clock.advanceTo(iso);
      await controller.tick();
    }

    expect(notificationDriver.calls.length).toBe(1);
  });

  it("does not re-fire while the same nudge is unacknowledged — only after a full further interval", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start();

    clock.advanceTo("2026-08-21T10:00:00.000Z"); // +60m: first nudge
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(1);

    clock.advanceTo("2026-08-21T10:30:00.000Z"); // +30m more: still within the same next interval
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(1);

    clock.advanceTo("2026-08-21T11:00:00.000Z"); // +60m more: second full interval complete
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(2);
  });

  it("a single catch-up tick well past the interval fires exactly one nudge, not one per skipped interval", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start();

    clock.advanceTo("2026-08-21T12:05:00.000Z"); // +3h05m elapsed, no ticks in between
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(1);
  });
});

describe("ReminderController — fires only while running", () => {
  it("idle: never fires, even after the interval has long elapsed", async () => {
    const { clock, notificationDriver, controller } = await setup();
    // Engine stays idle — never started.
    clock.advanceTo("2026-08-21T15:00:00.000Z");
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(0);
  });

  it("paused: no nudge while paused, even past the interval — and paused time does not count toward it", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start({ name: "Deep work" });

    clock.advanceTo("2026-08-21T09:50:00.000Z"); // 50m running
    await engine.pause();

    clock.advanceTo("2026-08-21T10:20:00.000Z"); // 30m paused (would be 80m if counted)
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(0);

    await engine.resume();
    clock.advanceTo("2026-08-21T10:30:00.000Z"); // +10m running (total running: 60m)
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(1);
  });

  it("paused with elapsed already past the interval: still no nudge — the state guard, not just the elapsed math, must suppress it", async () => {
    // Distinct from the test above: here `durationSeconds()` ALREADY sits
    // past the threshold at the moment of the tick (65m of running time
    // banked in the closed segment before the pause), so a version of
    // tick() that only relied on "is elapsed >= interval" — without also
    // checking `engine.state === "running"` — would fire here. Pausing an
    // already-overdue entry must still suppress the nudge until it's
    // running again.
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start({ name: "Long haul" });
    clock.advanceTo("2026-08-21T10:05:00.000Z"); // 65m running — past the 60m interval
    await engine.pause();

    await controller.tick(); // first tick happens only after the pause

    expect(notificationDriver.calls.length).toBe(0);
  });

  it("stopped mid-interval: no nudge ever fires for an entry that stops before reaching it", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();
    await engine.start();
    clock.advanceTo("2026-08-21T09:30:00.000Z"); // 30m
    await engine.stop();

    clock.advanceTo("2026-08-21T12:00:00.000Z");
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(0);
  });
});

describe("ReminderController — switching tasks resets the interval for the new entry", () => {
  it("a new entry (different id) does not inherit the prior entry's elapsed-toward-nudge progress", async () => {
    const { clock, engine, notificationDriver, controller } = await setup();

    await engine.start({ name: "Task A" });
    clock.advanceTo("2026-08-21T10:00:00.000Z"); // +60m: nudges for A
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(1);
    await engine.stop();

    await engine.start({ name: "Task B" });
    clock.advanceTo("2026-08-21T10:10:00.000Z"); // +10m into B — well under 60m
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(1); // unchanged — still just A's nudge

    clock.advanceTo("2026-08-21T11:00:00.000Z"); // B reaches 60m of its own
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(2);
    expect(notificationDriver.calls[1]?.body).toContain("Task B");
  });
});

describe("ReminderController — interval setting (off / custom)", () => {
  it("reminder.minutes = 0 means off: never fires regardless of elapsed time", async () => {
    const { clock, engine, notificationDriver, controller } = await setup({ minutes: 0 });
    await engine.start();

    clock.advanceTo("2026-08-21T14:00:00.000Z"); // +5h
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(0);
  });

  it("a custom 15m interval fires at 15m, not at the 60m default", async () => {
    const { clock, engine, notificationDriver, controller } = await setup({ minutes: 15 });
    await engine.start();

    clock.advanceTo("2026-08-21T09:14:00.000Z"); // 14m — short of 15
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(0);

    clock.advanceTo("2026-08-21T09:15:00.000Z"); // exactly 15m
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(1);
  });

  it("a custom 30m interval fires at 30m, not at 15m", async () => {
    const { clock, engine, notificationDriver, controller } = await setup({ minutes: 30 });
    await engine.start();

    clock.advanceTo("2026-08-21T09:15:00.000Z");
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(0);

    clock.advanceTo("2026-08-21T09:30:00.000Z");
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(1);
  });

  it("defaults to 60m (the pinned default) when no minutes option is supplied", async () => {
    const { controller } = await setup();
    expect(controller.minutes).toBe(60);
  });

  it("setMinutes() changes the live interval — the S12 settings seam", async () => {
    const { clock, engine, notificationDriver, controller } = await setup(); // default 60
    await engine.start();

    clock.advanceTo("2026-08-21T09:20:00.000Z"); // +20m — under the default 60m
    await controller.tick();
    expect(notificationDriver.calls.length).toBe(0);

    controller.setMinutes(15);
    expect(controller.minutes).toBe(15);
    await controller.tick(); // still 20m elapsed, now past the new 15m threshold

    expect(notificationDriver.calls.length).toBe(1);
  });
});

describe("ReminderController — click opens the popover", () => {
  it("the registered click callback opens the popover when invoked directly (BUILD_SPEC S8 acceptance)", async () => {
    const { notificationDriver, onOpenPopover, controller } = await setup();
    await controller.registerClickHandler();

    notificationDriver.click();

    expect(onOpenPopover).toHaveBeenCalledTimes(1);
  });

  it("clicking does not itself send a notification or touch the engine", async () => {
    const { notificationDriver, controller } = await setup();
    await controller.registerClickHandler();

    notificationDriver.click();

    expect(notificationDriver.calls.length).toBe(0);
  });
});

describe("ReminderController — localized nudge content", () => {
  it("renders the notification body in Spanish when the controller's locale is es, using the pinned 'en curso' idiom", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const notificationDriver = createFakeNotificationDriver();
    const controller = new ReminderController({
      engine,
      driver: notificationDriver,
      locale: "es",
      clock: clock.now,
    });

    await engine.start({ name: "Revisión de Acme" });
    clock.advanceTo("2026-08-21T10:00:00.000Z");
    await controller.tick();

    expect(notificationDriver.calls.length).toBe(1);
    expect(notificationDriver.calls[0]?.title).toMatch(/en curso/i);
    expect(notificationDriver.calls[0]?.body).toContain("Revisión de Acme");
  });
});
