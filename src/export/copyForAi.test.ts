// S10: Copy-for-AI markdown block builder — exercises the pinned literal
// shape (BUILD_SPEC "Pinned interfaces" Copy-for-AI block) at the row level.
// Byte-exact fixture matching lives in `goldenExports.test.ts`; this file
// targets the individual format rules the coordinator's brief calls out as
// sabotage-drill surfaces: the em dash for empty cells, "Xh Ym" vs bare
// "Ym", and the blank-line-then-"Total:" trailer shape.

import { describe, expect, it } from "vitest";
import type { ExportRow } from "./exportRows";
import { buildCopyForAiMarkdown } from "./copyForAi";

function row(overrides: Partial<ExportRow> & Pick<ExportRow, "task">): ExportRow {
  return {
    date: "2026-08-21",
    client: null,
    project: null,
    duration_minutes: 0,
    first_start: "2026-08-21T09:00:00-07:00",
    last_end: "2026-08-21T09:00:00-07:00",
    ...overrides,
  };
}

describe("buildCopyForAiMarkdown", () => {
  it("matches the pinned literal shape byte-for-byte", () => {
    const markdown = buildCopyForAiMarkdown("2026-08-21", [
      row({
        task: "Acme onboarding",
        client: "acme",
        project: "rollout",
        duration_minutes: 90,
        first_start: "2026-08-21T09:00:00-07:00",
        last_end: "2026-08-21T10:30:00-07:00",
      }),
      row({
        task: "Aug 21 · 11:00–11:45",
        client: null,
        project: null,
        duration_minutes: 45,
        first_start: "2026-08-21T11:00:00-07:00",
        last_end: "2026-08-21T11:45:00-07:00",
      }),
    ]);

    expect(markdown).toBe(
      [
        "Time entries for 2026-08-21 — file these into my time tracking system.",
        "",
        "| task | client | project | duration | start | end |",
        "|------|--------|---------|----------|-------|-----|",
        "| Acme onboarding | acme | rollout | 1h 30m | 09:00 | 10:30 |",
        "| Aug 21 · 11:00–11:45 | — | — | 45m | 11:00 | 11:45 |",
        "",
        "Total: 2h 15m",
        "",
      ].join("\n"),
    );
  });

  it("empty client/project render as the em dash U+2014, never a hyphen or blank cell", () => {
    const markdown = buildCopyForAiMarkdown("2026-08-21", [row({ task: "x", client: null, project: null })]);
    const dataRow = markdown.split("\n")[4]!;
    expect(dataRow).toContain(" — ");
    expect(dataRow).not.toContain(" - ");
    expect(dataRow.match(/—/gu)).toHaveLength(2);
  });

  it("duration renders 'Xh Ym' with zero-padded minutes when hours are present, bare 'Ym' when zero", () => {
    const markdown = buildCopyForAiMarkdown("2026-08-21", [
      row({ task: "a", duration_minutes: 125 }),
      row({ task: "b", duration_minutes: 5 }),
    ]);
    expect(markdown).toContain("| 2h 05m |");
    expect(markdown).toContain("| 5m |");
  });

  it("the Total line sums every row's duration_minutes, not just the last row's", () => {
    const markdown = buildCopyForAiMarkdown("2026-08-22", [
      row({ task: "a", duration_minutes: 125 }),
      row({ task: "b", duration_minutes: 30 }),
    ]);
    expect(markdown).toContain("Total: 2h 35m");
  });

  it("a single blank line separates the table from Total — not zero, not two", () => {
    const markdown = buildCopyForAiMarkdown("2026-08-21", [row({ task: "a" })]);
    const lines = markdown.split("\n");
    const totalIndex = lines.findIndex((l) => l.startsWith("Total:"));
    expect(lines[totalIndex - 1]).toBe("");
    expect(lines[totalIndex - 2]).not.toBe("");
  });
});
