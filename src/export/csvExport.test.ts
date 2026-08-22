// S10: CSV builder — BUILD_SPEC pinned columns
// `date, task, client, project, duration_minutes, first_start, last_end`,
// "empty client/project = empty cell". Byte-exact fixture matching lives in
// `goldenExports.test.ts`; this targets the empty-cell rule specifically
// (the coordinator's named sabotage-drill surface for CSV) plus basic
// escaping for values that would otherwise corrupt the format.

import { describe, expect, it } from "vitest";
import type { ExportRow } from "./exportRows";
import { buildCsv } from "./csvExport";

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

describe("buildCsv", () => {
  it("header row matches the pinned column order exactly", () => {
    const csv = buildCsv([]);
    expect(csv.split("\n")[0]).toBe("date,task,client,project,duration_minutes,first_start,last_end");
  });

  it("null client/project render as a genuinely EMPTY cell — two adjacent commas, not 'null' or a dash", () => {
    const csv = buildCsv([row({ task: "x", client: null, project: null, duration_minutes: 45 })]);
    const dataLine = csv.split("\n")[1]!;
    expect(dataLine).toBe("2026-08-21,x,,,45,2026-08-21T09:00:00-07:00,2026-08-21T09:00:00-07:00");
  });

  it("matches the pinned fixture's full first row", () => {
    const csv = buildCsv([
      row({
        task: "Acme onboarding",
        client: "acme",
        project: "rollout",
        duration_minutes: 90,
        first_start: "2026-08-21T09:00:00-07:00",
        last_end: "2026-08-21T10:30:00-07:00",
      }),
    ]);
    expect(csv).toBe(
      "date,task,client,project,duration_minutes,first_start,last_end\n2026-08-21,Acme onboarding,acme,rollout,90,2026-08-21T09:00:00-07:00,2026-08-21T10:30:00-07:00\n",
    );
  });

  it("a field containing a comma is quoted so it can't be mistaken for a column boundary", () => {
    const csv = buildCsv([row({ task: "a, b", client: null, project: null })]);
    expect(csv.split("\n")[1]).toContain('"a, b"');
  });

  it("a field containing a double quote is quoted with the quote doubled", () => {
    const csv = buildCsv([row({ task: 'say "hi"', client: null, project: null })]);
    expect(csv.split("\n")[1]).toContain('"say ""hi"""');
  });

  it("ends with exactly one trailing newline, no blank line after the last row", () => {
    const csv = buildCsv([row({ task: "a" })]);
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv.endsWith("\n\n")).toBe(false);
  });
});
