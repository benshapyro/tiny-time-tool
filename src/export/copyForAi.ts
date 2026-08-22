// S10: the Copy-for-AI markdown block — BUILD_SPEC "Pinned interfaces"
// literal shape (reproduced in this project's coordinator brief and,
// hand-authored from it, `fixtures/golden/copy-for-ai.md`):
//
//   Time entries for 2026-08-21 — file these into my time tracking system.
//
//   | task | client | project | duration | start | end |
//   |------|--------|---------|----------|-------|-----|
//   | Acme onboarding | acme | rollout | 1h 30m | 09:00 | 10:30 |
//   | Aug 21 · 11:00–11:45 | — | — | 45m | 11:00 | 11:45 |
//
//   Total: 2h 15m
//
// This header/table/"Total:" scaffolding is deliberately NOT run through
// the i18n layer — unlike every user-facing UI string, this block's own
// English shape is fixed regardless of viewer locale (the variant fixture,
// a Spanish-content day, still renders "Time entries for ...", "task",
// "Total:" in English — only the entries' own task/client/project TEXT
// varies). It is machine-parseable AI input, not a UI surface; BUILD_SPEC's
// "data stays machine-stable" principle applies to it exactly as it does to
// CSV/JSON.
//
// Empty client/project render as the em dash U+2014 (BUILD_SPEC: "empty
// client/project cells render —"), never a hyphen (`-`, U+002D) or a blank
// cell — a blank Markdown table cell renders ambiguously across renderers,
// and a hyphen is easily misread as a minus sign or a literal dash in the
// data. Per-row duration and the Total line both go through
// `formatDurationHM` on the row's already-rounded `duration_minutes`
// (converted to seconds) rather than re-deriving from raw segment seconds —
// this guarantees the CSV/JSON `duration_minutes` integer and this table's
// "Xh Ym" text can never drift apart for the same row.

import { formatDurationHM } from "../timer/formatDuration";
import type { ExportRow } from "./exportRows";

const EMPTY_CELL = "—"; // U+2014 EM DASH — BUILD_SPEC-pinned glyph, not a hyphen.

/** `ExportRow.first_start`/`last_end` are always
 * `YYYY-MM-DDTHH:mm:ss±HH:mm` (see `isoOffset.ts`) — the `HH:mm` substring
 * at a fixed offset is the exact same fixed-24-hour time already computed
 * once for the ISO field, so slicing it (rather than re-parsing the Date
 * and re-formatting) guarantees this table's start/end columns can never
 * disagree with the CSV/JSON `first_start`/`last_end` they're drawn from. */
function fixedTimeOfDay(isoWithOffset: string): string {
  return isoWithOffset.slice(11, 16);
}

export function buildCopyForAiMarkdown(dayKey: string, rows: readonly ExportRow[]): string {
  const lines: string[] = [];
  lines.push(`Time entries for ${dayKey} — file these into my time tracking system.`);
  lines.push("");
  lines.push("| task | client | project | duration | start | end |");
  lines.push("|------|--------|---------|----------|-------|-----|");

  let totalMinutes = 0;
  for (const row of rows) {
    totalMinutes += row.duration_minutes;
    const client = row.client ?? EMPTY_CELL;
    const project = row.project ?? EMPTY_CELL;
    const duration = formatDurationHM(row.duration_minutes * 60);
    const start = fixedTimeOfDay(row.first_start);
    const end = fixedTimeOfDay(row.last_end);
    lines.push(`| ${row.task} | ${client} | ${project} | ${duration} | ${start} | ${end} |`);
  }

  lines.push("");
  lines.push(`Total: ${formatDurationHM(totalMinutes * 60)}`);
  lines.push("");

  return lines.join("\n");
}
