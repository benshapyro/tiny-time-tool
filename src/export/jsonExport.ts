// S10: JSON export — BUILD_SPEC "Pinned interfaces": "JSON export mirrors
// the same fields and formats" as CSV. Where CSV's empty-cell rule renders
// an absent client/project as a blank field, JSON's equivalent is a real
// `null` (never an empty string `""`, which would be indistinguishable from
// an entry whose client is the literal empty string) — `ExportRow` already
// carries `client`/`project` as `string | null`, so `JSON.stringify` gets
// this right for free as long as nothing coerces `null` to `""` upstream.
//
// 2-space indent, one trailing newline (matches every other text file this
// project writes, e.g. `csvExport.ts`'s CSV). Key order is whatever order
// `ExportRow`'s object literal was built in (`exportRows.ts`) —
// `JSON.stringify` preserves string-key insertion order, so the two files
// staying in sync is a property of `exportRows.ts`, not reasserted here.

import type { ExportRow } from "./exportRows";

export function buildJson(rows: readonly ExportRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}
