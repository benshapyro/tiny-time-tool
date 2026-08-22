// S10 acceptance check, verbatim from BUILD_SPEC's S10 row: "Golden-file
// tests: seeded fixture day -> `diff -q` against `fixtures/golden/copy-for-
// ai.md`, `export.csv`, `export.json` exits 0; a second variant fixture
// (different day, unnamed entry, Spanish task name, null client) also
// matches its hand-authored goldens -- no special-casing fixtures."
//
// THE RULE THAT DEFINES THIS SLICE (coordinator's brief, itself quoting
// BUILD_SPEC): "Golden fixtures are authored by hand from the pinned format
// rules BEFORE the export code is written -- if code and fixture disagree,
// the code is wrong; fixtures are never regenerated from output." The six
// files under fixtures/golden/ are READ-ONLY here. This file only READS
// them (readFileSync, and via `diff -q` as a separate process) -- it never
// writes to fixtures/golden/.
//
// Seed data is derived from reading the fixtures themselves (see each
// fixture's own comment above its seeding block below), not invented
// independently -- exactly the "read all six fixtures first and derive the
// seed data your tests need from them" instruction.
//
// Two data paths through the SAME formatting functions are exercised
// end-to-end against a REAL TimerEngine + real SQLite driver (not
// hand-built DayEntry fixtures -- that's exportRows.test.ts's job): the
// Copy-for-AI single-day path (`entriesForDay`) and the CSV/JSON date-range
// path (`entriesForRange`), proving the range query and the day query agree
// on the same day's data.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { buildCopyForAiMarkdown } from "./copyForAi";
import { buildCsv } from "./csvExport";
import { buildExportRows } from "./exportRows";
import { buildJson } from "./jsonExport";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s10-"));
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

const REPO_ROOT = process.cwd();
function golden(name: string): string {
  return join(REPO_ROOT, "fixtures", "golden", name);
}

/** Writes `content` to a temp file and asserts `diff -q` against the golden
 * fixture exits 0 -- reads the REAL exit code from a real spawned process
 * (never a piped/derived status), per the acceptance check's own named
 * mechanism. Also asserts exact string equality as a second, independent
 * check of the same claim. */
function assertMatchesGolden(content: string, fixtureName: string, tmpName: string): void {
  const tmpPath = join(tempDir, tmpName);
  writeFileSync(tmpPath, content);
  const goldenPath = golden(fixtureName);

  expect(content).toBe(readFileSync(goldenPath, "utf8"));

  // execFileSync throws (with a non-zero .status on the error) if diff
  // reports a difference or the files don't exist -- there is nothing to
  // silently swallow here: a throw means non-zero, no throw means 0.
  execFileSync("diff", ["-q", tmpPath, goldenPath]);
}

describe("S10 golden exports", () => {
  it("primary fixture day (2026-08-21): Copy-for-AI, CSV, JSON all match their hand-authored goldens", async () => {
    // Seed derived from fixtures/golden/export.csv + export.json (the
    // authoritative field values) and copy-for-ai.md (the row order and
    // presentation): two entries on 2026-08-21 --
    //   1. "Acme onboarding" @acme #rollout, 09:00-10:30 PDT (90m)
    //   2. unnamed, 11:00-11:45 PDT (45m) -> auto-name "Aug 21 . 11:00-11:45"
    const dbPath = join(tempDir, "primary.db");
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-21T16:00:00.000Z"); // 09:00 PDT
    const engine = await TimerEngine.create(driver, clock.now);

    await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
    clock.advanceTo("2026-08-21T17:30:00.000Z"); // 10:30 PDT
    await engine.stop();

    clock.advanceTo("2026-08-21T18:00:00.000Z"); // 11:00 PDT
    await engine.start();
    clock.advanceTo("2026-08-21T18:45:00.000Z"); // 11:45 PDT
    await engine.stop();

    const dayEntries = await engine.entriesForDay("2026-08-21");
    expect(dayEntries).toHaveLength(2);
    const rows = buildExportRows(dayEntries, clock.now());

    assertMatchesGolden(buildCopyForAiMarkdown("2026-08-21", rows), "copy-for-ai.md", "copy-for-ai.md");

    const rangeEntries = await engine.entriesForRange("2026-08-21", "2026-08-21");
    expect(rangeEntries).toHaveLength(2);
    const rangeRows = buildExportRows(rangeEntries, clock.now());
    assertMatchesGolden(buildCsv(rangeRows), "export.csv", "export.csv");
    assertMatchesGolden(buildJson(rangeRows), "export.json", "export.json");
  });

  it("variant fixture day (2026-08-22, unnamed entry, Spanish task name, null client): matches its hand-authored goldens -- no special-casing", async () => {
    // Seed derived from fixtures/golden/export-variant.csv +
    // export-variant.json + copy-for-ai-variant.md: two entries on
    // 2026-08-22 --
    //   1. "Revisión de código" (Spanish name), client null,
    //      #migracion, 08:15-10:20 PDT (2h05m/125m)
    //   2. unnamed, 14:00-14:30 PDT (30m) -> auto-name
    //      "Aug 22 . 14:00-14:30" (en/24h, per the coordinator's pinned
    //      decision -- NOT Spanish, even though this is a Spanish-content
    //      day and the other row's task name is Spanish text).
    const dbPath = join(tempDir, "variant.db");
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-22T15:15:00.000Z"); // 08:15 PDT
    const engine = await TimerEngine.create(driver, clock.now);

    await engine.start({ name: "Revisión de código", client: null, project: "migracion" });
    clock.advanceTo("2026-08-22T17:20:00.000Z"); // 10:20 PDT
    await engine.stop();

    clock.advanceTo("2026-08-22T21:00:00.000Z"); // 14:00 PDT
    await engine.start();
    clock.advanceTo("2026-08-22T21:30:00.000Z"); // 14:30 PDT
    await engine.stop();

    const dayEntries = await engine.entriesForDay("2026-08-22");
    expect(dayEntries).toHaveLength(2);
    const rows = buildExportRows(dayEntries, clock.now());

    assertMatchesGolden(
      buildCopyForAiMarkdown("2026-08-22", rows),
      "copy-for-ai-variant.md",
      "copy-for-ai-variant.md",
    );

    const rangeEntries = await engine.entriesForRange("2026-08-22", "2026-08-22");
    const rangeRows = buildExportRows(rangeEntries, clock.now());
    assertMatchesGolden(buildCsv(rangeRows), "export-variant.csv", "export-variant.csv");
    assertMatchesGolden(buildJson(rangeRows), "export-variant.json", "export-variant.json");
  });
});
