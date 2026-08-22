// S10: `buildExportRows` — the shared row-shaping step CSV, JSON, and
// Copy-for-AI all build on (BUILD_SPEC S10 row + coordinator's pinned
// decisions: auto-name task cells use en/24-hour regardless of viewer
// locale; empty client/project stay `null`; `duration_minutes` is integer
// round-half-up). Exercised against plain `DayEntry`-shaped fixtures here —
// the full pipeline (real TimerEngine + SQLite) is covered by
// `goldenExports.test.ts`.

import { describe, expect, it } from "vitest";
import type { DayEntry } from "../timer/timerEngine";
import { buildExportRows } from "./exportRows";

const NOW = new Date("2026-08-21T20:00:00.000Z");

function dayEntry(overrides: {
  id: string;
  name: string | null;
  client: string | null;
  project: string | null;
  start: string;
  end: string | null;
}): DayEntry {
  return {
    entry: { id: overrides.id, name: overrides.name, client: overrides.client, project: overrides.project, createdAt: overrides.start },
    segments: [{ id: `${overrides.id}-seg`, entryId: overrides.id, startedAt: overrides.start, endedAt: overrides.end }],
  };
}

describe("buildExportRows", () => {
  it("matches the pinned fixture's first (named) row exactly", () => {
    const rows = buildExportRows(
      [dayEntry({ id: "1", name: "Acme onboarding", client: "acme", project: "rollout", start: "2026-08-21T16:00:00.000Z", end: "2026-08-21T17:30:00.000Z" })],
      NOW,
    );
    expect(rows).toEqual([
      {
        date: "2026-08-21",
        task: "Acme onboarding",
        client: "acme",
        project: "rollout",
        duration_minutes: 90,
        first_start: "2026-08-21T09:00:00-07:00",
        last_end: "2026-08-21T10:30:00-07:00",
      },
    ]);
  });

  it("a null-name entry's task cell is the en/24-hour auto-name, never the viewer's locale — even for a Spanish-day fixture", () => {
    const rows = buildExportRows(
      [dayEntry({ id: "2", name: null, client: null, project: null, start: "2026-08-22T21:00:00.000Z", end: "2026-08-22T21:30:00.000Z" })],
      NOW,
    );
    expect(rows[0]!.task).toBe("Aug 22 · 14:00–14:30");
  });

  it("empty client/project render as null, not empty string or the em-dash (that's the Copy-for-AI presentation layer's job)", () => {
    const rows = buildExportRows(
      [dayEntry({ id: "3", name: "x", client: null, project: null, start: "2026-08-21T16:00:00.000Z", end: "2026-08-21T16:10:00.000Z" })],
      NOW,
    );
    expect(rows[0]!.client).toBeNull();
    expect(rows[0]!.project).toBeNull();
  });

  it("duration_minutes rounds half-up to an integer", () => {
    // 90 seconds later than an exact 5 minutes -> 5m30s -> rounds to 6.
    const rows = buildExportRows(
      [dayEntry({ id: "4", name: "x", client: null, project: null, start: "2026-08-21T16:00:00.000Z", end: "2026-08-21T16:05:30.000Z" })],
      NOW,
    );
    expect(rows[0]!.duration_minutes).toBe(6);
  });

  it("an open (still-running) segment counts duration to `now` and uses `now` as last_end", () => {
    const rows = buildExportRows(
      [dayEntry({ id: "5", name: "x", client: null, project: null, start: "2026-08-21T19:00:00.000Z", end: null })],
      NOW,
    );
    expect(rows[0]!.duration_minutes).toBe(60);
    expect(rows[0]!.last_end).toBe("2026-08-21T13:00:00-07:00");
  });
});
