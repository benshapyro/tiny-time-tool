// S10: JSON builder — BUILD_SPEC: "JSON export mirrors the same fields and
// formats" as CSV. Byte-exact fixture matching lives in
// `goldenExports.test.ts`; this targets null-vs-empty-string (JSON's own
// empty-cell rule) and the 2-space pretty-printed shape.

import { describe, expect, it } from "vitest";
import type { ExportRow } from "./exportRows";
import { buildJson } from "./jsonExport";

describe("buildJson", () => {
  it("null client/project serialize as JSON null, never an empty string", () => {
    const row: ExportRow = {
      date: "2026-08-21",
      task: "x",
      client: null,
      project: null,
      duration_minutes: 45,
      first_start: "2026-08-21T11:00:00-07:00",
      last_end: "2026-08-21T11:45:00-07:00",
    };
    const json = buildJson([row]);
    const parsed = JSON.parse(json);
    expect(parsed[0].client).toBeNull();
    expect(parsed[0].project).toBeNull();
  });

  it("pretty-prints with 2-space indent and a single trailing newline, key order preserved", () => {
    const row: ExportRow = {
      date: "2026-08-21",
      task: "Acme onboarding",
      client: "acme",
      project: "rollout",
      duration_minutes: 90,
      first_start: "2026-08-21T09:00:00-07:00",
      last_end: "2026-08-21T10:30:00-07:00",
    };
    const json = buildJson([row]);
    expect(json).toBe(
      [
        "[",
        "  {",
        '    "date": "2026-08-21",',
        '    "task": "Acme onboarding",',
        '    "client": "acme",',
        '    "project": "rollout",',
        '    "duration_minutes": 90,',
        '    "first_start": "2026-08-21T09:00:00-07:00",',
        '    "last_end": "2026-08-21T10:30:00-07:00"',
        "  }",
        "]",
        "",
      ].join("\n"),
    );
  });

  it("an empty row list serializes as an empty array", () => {
    expect(buildJson([])).toBe("[]\n");
  });
});
