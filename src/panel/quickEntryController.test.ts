// S4: the quick-entry panel's business logic (BUILD_SPEC S4 row), decoupled
// from any real Tauri window so it's unit-testable — the panel React
// component (`QuickEntryPanel.tsx`) is a thin renderer of this controller's
// state. Exercises a real `TimerEngine` against a real SQLite temp file
// (same pattern as `shortcutController.test.ts`), not a mock engine.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { QuickEntryController } from "./quickEntryController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s4-panel-"));
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

describe("QuickEntryController — naming flow (primary-from-idle)", () => {
  it("empty-Enter commits a null name, and the entry's start time is unchanged by the later commit", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new QuickEntryController({ engine, locale: "en", clock: clock.now });

    const entry = await engine.start(); // shortcut press: tracking begins now
    controller.openForNaming();
    expect(controller.state.mode).toBe("naming");

    clock.advanceTo("2026-08-21T10:00:05.000Z"); // Enter comes moments later
    await controller.commit();

    const updated = await engine.entry(entry.id);
    expect(updated?.name).toBeNull();
    expect(controller.state.mode).toBe("closed");

    const segments = await engine.segmentsFor(entry.id);
    expect(segments[0]?.startedAt).toBe("2026-08-21T10:00:00.000Z"); // shortcut-press time, not commit time
  });

  it("typing 'Acme onboarding @acme #rollout' and committing splits name/client/project per the pinned grammar", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T10:00:00.000Z"));
    const controller = new QuickEntryController({ engine, locale: "en" });

    const entry = await engine.start();
    controller.openForNaming();
    controller.updateText("Acme onboarding @acme #rollout");
    await controller.commit();

    const updated = await engine.entry(entry.id);
    expect(updated).toMatchObject({ name: "Acme onboarding", client: "acme", project: "rollout" });
  });

  it("a later @ token stays literal in the name ('@acme deep-dive @beta #x')", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T10:00:00.000Z"));
    const controller = new QuickEntryController({ engine, locale: "en" });

    const entry = await engine.start();
    controller.openForNaming();
    controller.updateText("@acme deep-dive @beta #x");
    await controller.commit();

    const updated = await engine.entry(entry.id);
    expect(updated).toMatchObject({ name: "deep-dive @beta", client: "acme", project: "x" });
  });

  it("autocomplete returns the 2 matching fixtures for prefix 'Ac'", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T09:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    for (const name of ["Acme onboarding", "Acme deep-dive", "Beta review"]) {
      await engine.start({ name });
      await engine.stop();
      clock.advanceTo(new Date(clock.now().getTime() + 60_000).toISOString());
    }
    await engine.start(); // the entry the panel is currently naming
    const controller = new QuickEntryController({ engine, locale: "en" });
    controller.openForNaming();
    await controller.loadSuggestions();

    controller.updateText("Ac");
    // Most-recently-created first (TimerEngine.recentTaskNames' pinned
    // ordering — "Acme deep-dive" was created after "Acme onboarding").
    expect(controller.state.suggestions).toEqual(["Acme deep-dive", "Acme onboarding"]);
  });

  it("does not open the panel until openForNaming() is called (closed by default)", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new QuickEntryController({ engine, locale: "en" });
    expect(controller.state.mode).toBe("closed");
  });
});

describe("QuickEntryController — switch flow", () => {
  it("opening for switch with a running fixture renders the passive notice; Enter stops the old entry and starts the new one", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const oldEntry = await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });

    clock.advanceTo("2026-08-21T10:05:00.000Z"); // 5 minutes elapsed
    const controller = new QuickEntryController({ engine, locale: "en", clock: clock.now });
    await controller.openForSwitch();

    expect(controller.state.mode).toBe("switching");
    expect(controller.state.notice).toBe("Will stop: Acme onboarding (5:00)");

    controller.updateText("New task @acme");
    await controller.commit();

    expect(controller.state.mode).toBe("closed");
    const oldSegments = await engine.segmentsFor(oldEntry.id);
    expect(oldSegments[0]?.endedAt).toBe("2026-08-21T10:05:00.000Z");

    expect(engine.state).toBe("running");
    const newEntryId = engine.currentEntryId;
    expect(newEntryId).not.toBe(oldEntry.id);
    const newEntry = await engine.entry(newEntryId!);
    expect(newEntry).toMatchObject({ name: "New task", client: "acme", project: null });
  });

  it("the notice uses the auto-name display for a currently-running null-name entry", async () => {
    // Local-constructed timestamps (not a hand-typed `Z` string): this
    // assertion depends on locale display formatting, which reads local
    // wall-clock time — see entryDisplayName.test.ts's fixture discipline.
    const driver = trackDriver(dbPath);
    const start = new Date(2026, 7, 21, 10, 0, 0);
    const clock = fixedClock(start.toISOString());
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start(); // null name

    clock.advanceTo(new Date(2026, 7, 21, 10, 20, 0).toISOString());
    const controller = new QuickEntryController({ engine, locale: "en", clock: clock.now });
    await controller.openForSwitch();

    expect(controller.state.notice).toBe("Will stop: Aug 21 · 10:00 AM–10:20 AM (20:00)");
  });

  it("renders the notice in es idiomatically", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T10:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    await engine.start({ name: "Acme onboarding" });
    clock.advanceTo("2026-08-21T10:05:00.000Z");

    const controller = new QuickEntryController({ engine, locale: "es", clock: clock.now });
    await controller.openForSwitch();
    expect(controller.state.notice).toBe("Se detendrá: Acme onboarding (5:00)");
  });
});

describe("QuickEntryController — commit-then-pause (S4: primary press while the panel is open)", () => {
  it("commitIfOpen() is a no-op when the panel is closed", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const controller = new QuickEntryController({ engine, locale: "en" });
    await expect(controller.commitIfOpen()).resolves.toBeUndefined();
    expect(controller.state.mode).toBe("closed");
  });

  it("commitIfOpen() commits typed text and closes the panel when it was open", async () => {
    const driver = trackDriver(dbPath);
    const engine = await TimerEngine.create(driver, () => new Date("2026-08-21T09:00:00.000Z"));
    const entry = await engine.start();
    const controller = new QuickEntryController({ engine, locale: "en" });
    controller.openForNaming();
    controller.updateText("Focus block");

    await controller.commitIfOpen();

    expect(controller.state.mode).toBe("closed");
    const updated = await engine.entry(entry.id);
    expect(updated?.name).toBe("Focus block");
  });
});
