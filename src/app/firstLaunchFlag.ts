// S5: "On first launch the popover auto-opens once ..." — persisted in the
// app's own SQLite database (the `settings` table added by migration
// 0002_settings.sql) rather than localStorage: this app already has a
// durable, restart-survives persistence layer via `SqlDriver`, and
// BUILD_SPEC's pinned Settings keys section anticipates the same
// key-value shape for S12, so this table is the seam to reuse rather than
// reaching for a browser API the app has no other use for.
//
// One row, keyed `popover.autoOpened`; its mere presence means "already
// consumed" — no boolean parsing, no unset-vs-false ambiguity.
// `consumeFirstLaunch` is the whole seam: it returns `true` at most once
// ever, for a given database file, and `false` on every call after —
// including after a real process restart, since the row persists to disk.
// Read-then-write is safe because this app has exactly one process talking
// to its database at a time; there is no concurrent-launch scenario in
// scope.

import type { SqlDriver } from "../timer/sqlDriver";

const FLAG_KEY = "popover.autoOpened";

export async function consumeFirstLaunch(driver: SqlDriver): Promise<boolean> {
  const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [FLAG_KEY]);
  if (rows.length > 0) return false;
  await driver.execute("INSERT INTO settings (key, value) VALUES (?, ?)", [FLAG_KEY, "true"]);
  return true;
}
