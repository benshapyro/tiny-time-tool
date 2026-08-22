// S10: UI-facing controller for the Dashboard's Export section — "Copy for
// AI" (always today, per ST4's "copy my day") and CSV/JSON export by date
// range (ST5). Mirrors `LogController`'s architecture: a real SQLite-backed
// `TimerEngine` (never a mock), clock injected, side effects (clipboard
// write, file download) injected too so they're assertable without a real
// browser — same "no unit test for real browser I/O, but the controller
// logic feeding it is fully tested" split as `browserDownload.ts`'s own doc
// comment.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { ExportController } from "./exportController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s10-export-"));
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

/** Seeds one entry — 09:00-10:30 PDT (16:00-17:30 UTC) on 2026-08-21 — via
 * `clock`, which the caller must construct already positioned at
 * "2026-08-21T16:00:00.000Z" (09:00 PDT): this advances it FORWARD to
 * 17:30Z for `stop()`, so the clock passed in must start there, not at some
 * later "now" that would make the advance go backward. */
async function seededEngine(clock: ReturnType<typeof fixedClock>) {
  const driver = trackDriver(dbPath);
  const engine = await TimerEngine.create(driver, clock.now);
  await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
  clock.advanceTo("2026-08-21T17:30:00.000Z");
  await engine.stop();
  return engine;
}

describe("ExportController", () => {
  it("initial state's date range defaults to today (the injected clock's local day)", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const controller = new ExportController({ engine, clock: clock.now });
    expect(controller.state.rangeStart).toBe("2026-08-21");
    expect(controller.state.rangeEnd).toBe("2026-08-21");
    expect(controller.state.copyStatus).toBe("idle");
    expect(controller.state.rangeError).toBeNull();
  });

  it("copyTodayForAi builds today's Copy-for-AI markdown and hands it to the injected clipboard writer", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const copyToClipboard = vi.fn().mockResolvedValue(undefined);
    const controller = new ExportController({ engine, clock: clock.now, copyToClipboard });

    await controller.copyTodayForAi();

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    const written = copyToClipboard.mock.calls[0]![0] as string;
    expect(written).toContain("Time entries for 2026-08-21");
    expect(written).toContain("Acme onboarding");
    expect(controller.state.copyStatus).toBe("copied");
  });

  it("copyTodayForAi sets copyStatus to 'error' (never throws) when the clipboard writer rejects", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const copyToClipboard = vi.fn().mockRejectedValue(new Error("denied"));
    const controller = new ExportController({ engine, clock: clock.now, copyToClipboard });

    await expect(controller.copyTodayForAi()).resolves.toBeUndefined();
    expect(controller.state.copyStatus).toBe("error");
  });

  it("exportCsv hands the injected downloadFile the exact buildCsv output for the selected range", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const downloadFile = vi.fn();
    const controller = new ExportController({ engine, clock: clock.now, downloadFile });

    await controller.exportCsv();

    expect(downloadFile).toHaveBeenCalledTimes(1);
    const [filename, content, mimeType] = downloadFile.mock.calls[0]!;
    expect(filename).toMatch(/\.csv$/);
    expect(content).toBe(
      "date,task,client,project,duration_minutes,first_start,last_end\n2026-08-21,Acme onboarding,acme,rollout,90,2026-08-21T09:00:00-07:00,2026-08-21T10:30:00-07:00\n",
    );
    expect(mimeType).toBe("text/csv");
  });

  it("exportJson hands the injected downloadFile the exact buildJson output for the selected range", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const downloadFile = vi.fn();
    const controller = new ExportController({ engine, clock: clock.now, downloadFile });

    await controller.exportJson();

    const [filename, content, mimeType] = downloadFile.mock.calls[0]!;
    expect(filename).toMatch(/\.json$/);
    const parsed = JSON.parse(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].task).toBe("Acme onboarding");
    expect(mimeType).toBe("application/json");
  });

  it("a range with start after end sets rangeError and does NOT call downloadFile", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const downloadFile = vi.fn();
    const controller = new ExportController({ engine, clock: clock.now, downloadFile });

    controller.setRangeStart("2026-08-22");
    controller.setRangeEnd("2026-08-20");
    await controller.exportCsv();

    expect(downloadFile).not.toHaveBeenCalled();
    expect(controller.state.rangeError).toBe("invalidOrder");
  });

  it("setRangeStart/setRangeEnd clear a previous rangeError", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const controller = new ExportController({ engine, clock: clock.now, downloadFile: vi.fn() });

    controller.setRangeStart("2026-08-22");
    controller.setRangeEnd("2026-08-20");
    await controller.exportCsv();
    expect(controller.state.rangeError).toBe("invalidOrder");

    controller.setRangeEnd("2026-08-23");
    expect(controller.state.rangeError).toBeNull();
  });

  it("onStateChange fires after each state-mutating action", async () => {
    const clock = fixedClock("2026-08-21T16:00:00.000Z");
    const engine = await seededEngine(clock);
    const onStateChange = vi.fn();
    const controller = new ExportController({ engine, clock: clock.now, onStateChange });

    controller.setRangeStart("2026-08-20");
    expect(onStateChange).toHaveBeenCalled();
    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1]!;
    expect(lastCall[0]).toBe(controller.state);
  });
});
