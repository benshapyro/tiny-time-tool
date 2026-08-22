// S6: business logic for the Dashboard's Log tab (BUILD_SPEC S6 row).
// Exercised against a real SQLite-backed TimerEngine (never a mock), same
// convention as `popoverController.test.ts` / `panelWiring.test.ts` / every
// other slice that touches persistence. Acceptance checks covered here:
// fixture DB renders the seeded (today) day; date nav to a past fixture day
// shows its 2 entries; empty day shows the designed empty state naming the
// shortcut.
//
// Fixtures are built via the LOCAL Date constructor (`new Date(y, m, d, h,
// min)`), never a hand-typed `Z` ISO string, then round-tripped through
// `.toISOString()` — this project's existing convention for any test that
// asserts a *display* time (see `entryDisplayName.test.ts`'s doc comment):
// it keeps the test deterministic on any machine/CI regardless of its
// timezone offset, since "9:00 AM" always means 9:00 local wall-clock.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentAcceleratorPlatform, formatAccelerator } from "../shortcuts/formatAccelerator";
import { DEFAULT_ACCELERATORS } from "../shortcuts/shortcutController";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { LogController } from "./logController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s6-log-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

/** Local wall-clock instant, day 20/21/22 = Aug 2026 unless overridden. */
function local(day: number, hour: number, minute: number, month = 8, year = 2026): Date {
  return new Date(year, month - 1, day, hour, minute, 0);
}

function fixedClock(start: Date) {
  let current = start;
  return {
    now: () => current,
    advanceTo: (next: Date) => {
      current = next;
    },
  };
}

// Fixture calendar, all local: Aug 20 (Thu, 2 entries), Aug 21 (Fri, no
// entries — the empty day), Aug 22 (Sat, "today", 3 entries incl. tags).
async function seedFixtureCalendar(engine: TimerEngine, clock: ReturnType<typeof fixedClock>) {
  // Aug 20 — 2 entries, the past day date-nav lands on.
  clock.advanceTo(local(20, 9, 0));
  await engine.start({ name: "Yesterday-ish task" });
  clock.advanceTo(local(20, 9, 30));
  await engine.stop();

  clock.advanceTo(local(20, 10, 0));
  await engine.start({ name: "Second task that day" });
  clock.advanceTo(local(20, 10, 15));
  await engine.stop();

  // Aug 21 — deliberately nothing: the empty-day fixture.

  // Aug 22 ("today") — 3 entries, one carrying tags, one null-named.
  clock.advanceTo(local(22, 9, 0));
  await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
  clock.advanceTo(local(22, 10, 30));
  await engine.stop();

  clock.advanceTo(local(22, 11, 0));
  await engine.start(); // null name -> auto-name
  clock.advanceTo(local(22, 11, 45));
  await engine.stop();

  clock.advanceTo(local(22, 13, 0));
  await engine.start({ name: "Deep work" });
  clock.advanceTo(local(22, 13, 35));
  await engine.stop();
}

describe("LogController — today-first", () => {
  it("opens on today by default and renders the seeded day's entries, times, durations, and tags", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(20, 8, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    await seedFixtureCalendar(engine, clock);
    clock.advanceTo(local(22, 14, 0)); // "now" is today, after all entries

    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    expect(controller.state.dayKey).toBe("2026-08-22");
    expect(controller.state.isToday).toBe(true);
    expect(controller.state.entries).toHaveLength(3);

    const acme = controller.state.entries.find((e) => e.name === "Acme onboarding");
    expect(acme).toMatchObject({
      startLabel: "9:00 AM",
      endLabel: "10:30 AM",
      durationLabel: "1h 30m",
      client: "acme",
      project: "rollout",
    });

    const autoNamed = controller.state.entries[1];
    expect(autoNamed?.name).toBe("Aug 22 · 11:00 AM–11:45 AM");
    expect(autoNamed?.client).toBeNull();
    expect(autoNamed?.project).toBeNull();

    expect(controller.state.totalLabel).toBe("2h 50m"); // 1h30 + 45m + 35m
    expect(controller.state.emptyStateTeachLine).toBeNull();
  });
});

describe("LogController — date navigation", () => {
  it("navigating to a past fixture day shows its 2 entries", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(20, 8, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    await seedFixtureCalendar(engine, clock);
    clock.advanceTo(local(22, 14, 0));

    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh(); // today

    await controller.goToPreviousDay(); // Aug 21 (empty)
    await controller.goToPreviousDay(); // Aug 20 (2 entries)

    expect(controller.state.dayKey).toBe("2026-08-20");
    expect(controller.state.isToday).toBe(false);
    expect(controller.state.entries).toHaveLength(2);
    expect(controller.state.entries.map((e) => e.name)).toEqual([
      "Yesterday-ish task",
      "Second task that day",
    ]);
    expect(controller.state.totalLabel).toBe("45m"); // 30m + 15m
  });

  it("empty day (Aug 21, between the two fixture days) shows the designed empty state naming the shortcut", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(20, 8, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    await seedFixtureCalendar(engine, clock);
    clock.advanceTo(local(22, 14, 0));

    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();
    await controller.goToPreviousDay(); // Aug 21 — empty

    expect(controller.state.dayKey).toBe("2026-08-21");
    expect(controller.state.entries).toHaveLength(0);
    expect(controller.state.totalLabel).toBe("0m");
    const line = controller.state.emptyStateTeachLine ?? "";
    // Same F6 guard as the popover's teach line: never the raw Tauri token.
    expect(line).not.toContain("CmdOrCtrl");
    expect(line).toBe(
      `Press ${formatAccelerator(DEFAULT_ACCELERATORS.primary, currentAcceleratorPlatform(), "en")} to start tracking`,
    );
  });

  it("empty-state teach line in es is idiomatic and also names the shortcut", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => local(22, 9, 0));
    const controller = new LogController({
      engine,
      locale: "es",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    });

    await controller.refresh();

    const line = controller.state.emptyStateTeachLine ?? "";
    expect(line).not.toContain("CmdOrCtrl");
    expect(line).toContain(formatAccelerator(DEFAULT_ACCELERATORS.primary, currentAcceleratorPlatform(), "es"));
    expect(line).not.toMatch(/rastreando/i);
  });

  it("goToday() returns to today from any navigated-away day", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(22, 9, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    await controller.goToPreviousDay();
    await controller.goToPreviousDay();
    expect(controller.state.isToday).toBe(false);

    await controller.goToday();
    expect(controller.state.isToday).toBe(true);
    expect(controller.state.dayKey).toBe("2026-08-22");
  });

  it("bounds forward navigation at today: canGoNext is false on today, true on a past day, and goToNextDay() from today is a no-op", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(22, 9, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();
    expect(controller.state.canGoNext).toBe(false);

    await controller.goToNextDay(); // no-op — already bounded at today
    expect(controller.state.dayKey).toBe("2026-08-22");
    expect(controller.state.isToday).toBe(true);

    await controller.goToPreviousDay();
    expect(controller.state.canGoNext).toBe(true);

    await controller.goToNextDay(); // back to today
    expect(controller.state.dayKey).toBe("2026-08-22");
    expect(controller.state.isToday).toBe(true);
  });
});

describe("LogController — a currently-running entry still renders sensibly in the day view", () => {
  it("an open segment's end time and duration are computed to the injected clock's 'now', not left blank", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(22, 9, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Still running" });
    clock.advanceTo(local(22, 9, 12));

    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();

    expect(controller.state.entries).toHaveLength(1);
    expect(controller.state.entries[0]).toMatchObject({
      name: "Still running",
      startLabel: "9:00 AM",
      endLabel: "9:12 AM",
      durationLabel: "12m",
    });
  });
});

// Cross-module concern (S5's lesson, restated in BUILD_SPEC review notes):
// the Log tab does not itself mutate the engine (that's S7's job), but it
// MUST observe mutations other surfaces make while it's open — a shortcut
// press, a popover action, a panel commit. `refresh()` is the seam
// `bootstrap.ts` calls from those surfaces' own sync points; this proves the
// seam actually reflects a mutation it did not cause itself.
describe("LogController — observes engine mutations made by another surface", () => {
  it("a second refresh() after an external engine.start() (simulating e.g. a shortcut press) picks up the new entry", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(22, 9, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await controller.refresh();
    expect(controller.state.entries).toHaveLength(0);

    // Some other surface (not this controller) mutates the shared engine.
    await engine.start({ name: "Started elsewhere" });
    clock.advanceTo(local(22, 9, 5));

    await controller.refresh();
    expect(controller.state.entries).toHaveLength(1);
    expect(controller.state.entries[0]?.name).toBe("Started elsewhere");
  });
});

describe("LogController — onStateChange", () => {
  it("fires with every state update", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => local(22, 9, 0));
    const onStateChange = vi.fn();
    const controller = new LogController({
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

// Review finding on S6: the viewed day was pinned at construction, so a
// Dashboard left open across midnight kept repainting yesterday. The
// Dashboard is the main window — staying open overnight is normal.
describe("LogController — the clock crossing midnight while the view is alive", () => {
  it("follows today into the new day when the user has not navigated away", async () => {
    const driver = trackDriver(dbPath);
    // Local components, not a UTC string: the first version of this test used
    // UTC times that never crossed LOCAL midnight in this machine's zone, so it
    // failed while the code was correct.
    let now = new Date(2026, 7, 21, 23, 50);
    const engine = await TimerEngine.create(driver, () => now);
    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: () => now,
    });
    await controller.refresh();
    const beforeMidnight = controller.state.dayKey;
    expect(controller.state.isToday).toBe(true);

    now = new Date(2026, 7, 22, 0, 10);
    await controller.refresh();

    expect(controller.state.dayKey).not.toBe(beforeMidnight);
    expect(controller.state.isToday).toBe(true);
  });

  it("does NOT yank the user forward when they deliberately navigated to a past day", async () => {
    const driver = trackDriver(dbPath);
    let now = new Date(2026, 7, 21, 23, 50);
    const engine = await TimerEngine.create(driver, () => now);
    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: () => now,
    });
    await controller.goToPreviousDay();
    const pinned = controller.state.dayKey;

    now = new Date(2026, 7, 22, 0, 10);
    await controller.refresh();

    expect(controller.state.dayKey).toBe(pinned);
    expect(controller.state.isToday).toBe(false);
  });
});
