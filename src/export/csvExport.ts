// S10: CSV export — BUILD_SPEC "Pinned interfaces": "CSV columns, one row
// per entry: `date, task, client, project, duration_minutes, first_start,
// last_end`. ... empty client/project = empty cell."
//
// "Empty cell" means a genuinely empty CSV field (two adjacent commas),
// never the string "null", never Copy-for-AI's em dash (that glyph is
// specific to the AI-readable markdown block — CSV is machine input for a
// spreadsheet, where a literal "—" character would just be wrong data, not
// a designed empty-state).
//
// Field escaping follows RFC 4180: a field containing a comma, double quote,
// or newline is wrapped in double quotes with any embedded quote doubled.
// None of the six golden fixtures need it (no task/client/project text
// contains a comma or quote), but user-entered task names can contain
// anything, and a formatter that only handles the fixtures' happy path
// would silently corrupt a real export the moment someone names a task
// "Fix bug, then ship".

import type { ExportRow } from "./exportRows";

const CSV_HEADER = "date,task,client,project,duration_minutes,first_start,last_end";

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(rows: readonly ExportRow[]): string {
  const lines = [CSV_HEADER];
  for (const row of rows) {
    lines.push(
      [
        row.date,
        csvField(row.task),
        row.client === null ? "" : csvField(row.client),
        row.project === null ? "" : csvField(row.project),
        String(row.duration_minutes),
        row.first_start,
        row.last_end,
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
