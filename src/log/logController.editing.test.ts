// S7: LogController's editing surface (BUILD_SPEC S7 row). Split from
// logController.test.ts (S6, read-only) for the same reason
// timerEngine.editing.test.ts is split from timerEngine.test.ts — a
// distinct concern layered on top of the day-view controller that already
// existed. Exercised against a real SQLite-backed TimerEngine, same
// convention as every other controller test in this project.
//
// Covers the acceptance checks BUILD_SPEC pins for S7: each edit persists
// and durations recompute (delegated to timerEngine.editing.test.ts for the
// SQLite-level proof; here we prove the CONTROLLER wires it through and
// reflects it in LogState); overlapping-times edit surfaces the designed
// inline error (LogState.editError, not a thrown exception reaching the
// caller); delete->undo restores the row byte-identical (proved via raw
// driver reads, not the in-memory objects this suite already holds); a
// running-entry fixture allows name/tag/start edits and — the important
// negative — LogEntryView.isRunning is true with endIso: null so Log.tsx has
// no raw material to build an end-time control from at all.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ACCELERATORS } from "../shortcuts/shortcutController";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { LogController } from "./logController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s7-logctl-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

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

async function makeController(dbPathOverride?: string) {
  const driver = trackDriver(dbPathOverride ?? dbPath);
  const clock = fixedClock(local(20, 8, 0));
  const engine = await TimerEngine.create(driver, clock.now);
  const controller = new LogController({
    engine,
    locale: "en",
    primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    clock: clock.now,
  });
  return { driver, clock, engine, controller };
}

describe("LogController — rename and tag edits persist and are reflected", () => {
  it("saveEdit renames an entry and changes its tags; the new values appear after refresh", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Old name", client: "old-client", project: "old-project" });
    clock.advanceTo(local(20, 9, 30));
    await engine.stop();
    await controller.refresh();

    const before = controller.state.entries[0]!;
    await controller.saveEdit(entry.id, {
      name: "New name",
      client: "new-client",
      project: "new-project",
      start: before.startIso,
      end: before.endIso!,
    });

    const after = controller.state.entries[0]!;
    expect(after.name).toBe("New name");
    expect(after.rawName).toBe("New name");
    expect(after.client).toBe("new-client");
    expect(after.project).toBe("new-project");
    expect(controller.state.editError).toBeNull();
    expect(controller.state.editingEntryId).toBeNull();
  });

  it("saving an empty name reverts the entry to its localized auto-name (null, not the empty string, is persisted)", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Named task" });
    clock.advanceTo(local(20, 9, 15));
    await engine.stop();
    await controller.refresh();
    const before = controller.state.entries[0]!;

    await controller.saveEdit(entry.id, {
      name: null,
      client: null,
      project: null,
      start: before.startIso,
      end: before.endIso!,
    });

    const after = controller.state.entries[0]!;
    expect(after.rawName).toBeNull();
    expect(after.name).toBe("Aug 20 · 9:00 AM–9:15 AM");
  });
});

describe("LogController — start/stop time edits persist and durations recompute", () => {
  it("editing the start time shortens the entry and the day total follows", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Task" });
    clock.advanceTo(local(20, 10, 0)); // 60m
    await engine.stop();
    await controller.refresh();
    expect(controller.state.entries[0]?.durationLabel).toBe("1h 00m");
    expect(controller.state.totalLabel).toBe("1h 00m");

    const before = controller.state.entries[0]!;
    await controller.saveEdit(entry.id, {
      name: before.rawName,
      client: before.client,
      project: before.project,
      start: new Date(local(20, 9, 30)).toISOString(), // now 30m
      end: before.endIso!,
    });

    expect(controller.state.entries[0]?.durationLabel).toBe("30m");
    expect(controller.state.totalLabel).toBe("30m");
    expect(controller.state.editError).toBeNull();
  });
});

describe("LogController — overlapping-times edit is rejected with the designed inline error", () => {
  it("an overlap sets LogState.editError (not a thrown exception) and keeps the entry in edit mode", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    await engine.start({ name: "First" });
    clock.advanceTo(local(20, 9, 30));
    await engine.stop();

    clock.advanceTo(local(20, 10, 0));
    const second = await engine.start({ name: "Second" });
    clock.advanceTo(local(20, 10, 30));
    await engine.stop();
    await controller.refresh();

    controller.beginEdit(second.id);
    const secondView = controller.state.entries.find((e) => e.id === second.id)!;

    // Attempt to stretch "Second" backward into "First"'s range.
    await expect(
      controller.saveEdit(second.id, {
        name: secondView.rawName,
        client: secondView.client,
        project: secondView.project,
        start: new Date(local(20, 9, 15)).toISOString(),
        end: secondView.endIso!,
      }),
    ).resolves.toBeUndefined(); // never throws to the caller

    expect(controller.state.editError).not.toBeNull();
    expect(controller.state.editError?.entryId).toBe(second.id);
    expect(controller.state.editError?.code).toBe("overlap");
    expect(controller.state.editError?.message.length).toBeGreaterThan(0);
    // The designed error, not a bare exception string.
    expect(controller.state.editError?.message).not.toMatch(/Error:/);
    // Stays in edit mode so the user can see the error next to the form.
    expect(controller.state.editingEntryId).toBe(second.id);

    // And the persisted data is genuinely unchanged.
    const stillSecond = controller.state.entries.find((e) => e.id === second.id)!;
    expect(stillSecond.startLabel).toBe("10:00 AM");
  });

  it("the overlap error message is localized in es and is idiomatic (not the raw exception name)", async () => {
    const { clock, engine, controller: enController } = await makeController(dbPath);
    clock.advanceTo(local(20, 9, 0));
    await engine.start({ name: "First" });
    clock.advanceTo(local(20, 9, 30));
    await engine.stop();
    clock.advanceTo(local(20, 10, 0));
    const second = await engine.start({ name: "Second" });
    clock.advanceTo(local(20, 10, 30));
    await engine.stop();
    await enController.refresh();

    const esController = new LogController({
      engine,
      locale: "es",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
    });
    await esController.refresh();
    const secondView = esController.state.entries.find((e) => e.id === second.id)!;

    await esController.saveEdit(second.id, {
      name: secondView.rawName,
      client: secondView.client,
      project: secondView.project,
      start: new Date(local(20, 9, 15)).toISOString(),
      end: secondView.endIso!,
    });

    expect(esController.state.editError?.code).toBe("overlap");
    expect(esController.state.editError?.message).not.toMatch(/OverlapError/);
    expect(esController.state.editError?.message.length).toBeGreaterThan(0);
  });

  it("a non-overlapping edit clears any previous editError", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Task" });
    clock.advanceTo(local(20, 9, 30));
    await engine.stop();
    await controller.refresh();
    const before = controller.state.entries[0]!;

    // First, force an invalid-range error (end before start).
    await controller.saveEdit(entry.id, {
      name: before.rawName,
      client: before.client,
      project: before.project,
      start: before.endIso!,
      end: before.startIso,
    });
    expect(controller.state.editError?.code).toBe("invalidRange");

    // Then a legitimate edit clears it.
    await controller.saveEdit(entry.id, {
      name: before.rawName,
      client: before.client,
      project: before.project,
      start: before.startIso,
      end: before.endIso!,
    });
    expect(controller.state.editError).toBeNull();
  });
});

describe("LogController — delete with undo restores byte-identical rows", () => {
  it("deleteEntry removes the row; undoDelete restores it with the same id/timestamps, verified via raw SQL", async () => {
    const { driver, clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
    clock.advanceTo(local(20, 9, 20));
    await engine.pause();
    clock.advanceTo(local(20, 9, 30));
    await engine.resume();
    clock.advanceTo(local(20, 9, 45));
    await engine.stop();
    await controller.refresh();

    const beforeEntryRows = await driver.select("SELECT * FROM time_entries WHERE id = ?", [entry.id]);
    const beforeSegmentRows = await driver.select(
      "SELECT * FROM segments WHERE entry_id = ? ORDER BY started_at ASC",
      [entry.id],
    );

    await controller.deleteEntry(entry.id);
    expect(controller.state.entries.find((e) => e.id === entry.id)).toBeUndefined();
    expect(controller.state.pendingUndo).not.toBeNull();
    expect(controller.state.pendingUndo?.entryId).toBe(entry.id);
    expect(controller.state.pendingUndo?.label).toContain("Acme onboarding");

    const midEntryRows = await driver.select("SELECT * FROM time_entries WHERE id = ?", [entry.id]);
    expect(midEntryRows).toHaveLength(0);

    await controller.undoDelete();

    const afterEntryRows = await driver.select("SELECT * FROM time_entries WHERE id = ?", [entry.id]);
    const afterSegmentRows = await driver.select(
      "SELECT * FROM segments WHERE entry_id = ? ORDER BY started_at ASC",
      [entry.id],
    );
    expect(afterEntryRows).toEqual(beforeEntryRows);
    expect(afterSegmentRows).toEqual(beforeSegmentRows);
    expect(controller.state.pendingUndo).toBeNull();
    expect(controller.state.entries.find((e) => e.id === entry.id)).toBeDefined();
  });

  it("dismissUndo clears the toast without restoring the row", async () => {
    const { driver, clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Gone for good" });
    clock.advanceTo(local(20, 9, 10));
    await engine.stop();
    await controller.refresh();

    await controller.deleteEntry(entry.id);
    controller.dismissUndo();
    expect(controller.state.pendingUndo).toBeNull();

    await controller.undoDelete(); // no-op: nothing pending
    const rows = await driver.select("SELECT * FROM time_entries WHERE id = ?", [entry.id]);
    expect(rows).toHaveLength(0);
  });

  it("refuses to delete the currently running entry", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Still going" });
    await controller.refresh();

    await expect(controller.deleteEntry(entry.id)).rejects.toThrow();
    expect(controller.state.entries.find((e) => e.id === entry.id)).toBeDefined();
  });
});

describe("LogController — running entry: name/tags/start editable, no end-time material exposed", () => {
  it("the running entry's view has isRunning=true and endIso=null", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    await engine.start({ name: "Live task" });
    clock.advanceTo(local(20, 9, 12));
    await controller.refresh();

    const view = controller.state.entries[0]!;
    expect(view.isRunning).toBe(true);
    expect(view.endIso).toBeNull();
    expect(view.startIso).toBe(new Date(local(20, 9, 0)).toISOString());
  });

  it("name/tag/start edits succeed live on the running entry", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Live task" });
    clock.advanceTo(local(20, 9, 12));
    await controller.refresh();
    const before = controller.state.entries[0]!;

    await controller.saveEdit(entry.id, {
      name: "Renamed live",
      client: "acme",
      project: "rollout",
      start: new Date(local(20, 8, 55)).toISOString(),
      // deliberately no `end` field — there is nothing to submit.
    });

    expect(controller.state.editError).toBeNull();
    const after = controller.state.entries[0]!;
    expect(after.rawName).toBe("Renamed live");
    expect(after.client).toBe("acme");
    expect(after.project).toBe("rollout");
    expect(after.isRunning).toBe(true);
    expect(after.endIso).toBeNull();
    expect(before.startIso).not.toBe(after.startIso);
  });

  it("an end-time edit attempted anyway against the running entry surfaces the designed error, not a crash", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Live task" });
    await controller.refresh();

    await expect(
      controller.saveEdit(entry.id, {
        name: "Live task",
        client: null,
        project: null,
        start: new Date(local(20, 9, 0)).toISOString(),
        end: new Date(local(20, 9, 5)).toISOString(),
      }),
    ).resolves.toBeUndefined();

    expect(controller.state.editError?.code).toBe("runningEndNotEditable");
  });
});

describe("LogController — editing works on any day, not just today", () => {
  it("edits an entry on a past, navigated-to day", async () => {
    const { clock, engine, controller } = await makeController();
    clock.advanceTo(local(15, 9, 0));
    const entry = await engine.start({ name: "Ancient task" });
    clock.advanceTo(local(15, 9, 20));
    await engine.stop();
    clock.advanceTo(local(20, 9, 0)); // "today" is the 20th
    await controller.refresh();

    for (let i = 0; i < 5; i++) await controller.goToPreviousDay();
    expect(controller.state.dayKey).toBe("2026-08-15");
    const before = controller.state.entries.find((e) => e.id === entry.id)!;

    await controller.saveEdit(entry.id, {
      name: "Ancient task, corrected",
      client: before.client,
      project: before.project,
      start: before.startIso,
      end: before.endIso!,
    });

    expect(controller.state.editError).toBeNull();
    expect(controller.state.entries.find((e) => e.id === entry.id)?.rawName).toBe("Ancient task, corrected");
  });
});

describe("LogController — cross-surface: edits notify onEngineMutated", () => {
  it("fires onEngineMutated after a successful saveEdit, deleteEntry, and undoDelete", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(20, 8, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    const onEngineMutated = vi.fn();
    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
      onEngineMutated,
    });
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Task" });
    clock.advanceTo(local(20, 9, 10));
    await engine.stop();
    await controller.refresh();
    const before = controller.state.entries[0]!;

    await controller.saveEdit(entry.id, {
      name: before.rawName,
      client: before.client,
      project: before.project,
      start: before.startIso,
      end: before.endIso!,
    });
    expect(onEngineMutated).toHaveBeenCalledTimes(1);

    await controller.deleteEntry(entry.id);
    expect(onEngineMutated).toHaveBeenCalledTimes(2);

    await controller.undoDelete();
    expect(onEngineMutated).toHaveBeenCalledTimes(3);
  });

  it("does NOT fire onEngineMutated when a saveEdit is rejected (nothing actually mutated)", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock(local(20, 8, 0));
    const engine = await TimerEngine.create(driver, clock.now);
    const onEngineMutated = vi.fn();
    const controller = new LogController({
      engine,
      locale: "en",
      primaryAccelerator: DEFAULT_ACCELERATORS.primary,
      clock: clock.now,
      onEngineMutated,
    });
    clock.advanceTo(local(20, 9, 0));
    const entry = await engine.start({ name: "Task" });
    clock.advanceTo(local(20, 9, 10));
    await engine.stop();
    await controller.refresh();
    const before = controller.state.entries[0]!;

    await controller.saveEdit(entry.id, {
      name: before.rawName,
      client: before.client,
      project: before.project,
      start: before.endIso!, // invalid: start after end
      end: before.startIso,
    });

    expect(controller.state.editError).not.toBeNull();
    expect(onEngineMutated).not.toHaveBeenCalled();
  });
});
