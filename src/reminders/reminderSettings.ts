// S8: `reminder.minutes` is a pinned settings key (BUILD_SPEC "Pinned
// interfaces" -> Settings keys: "reminder.minutes (60, 0=off)"), persisted
// in the existing `settings` key-value table (migration
// 0002_settings.sql) rather than a new table — that migration's own doc
// comment already anticipates this exact key as its next consumer after
// `firstLaunchFlag.ts`'s `popover.autoOpened`.
//
// This module owns the value; S8 also owns the behaviour that reads it
// (`ReminderController`). S12 will build the Settings UI that calls
// `setReminderMinutes` from a user action — this module is the seam it
// reuses rather than a new one.

import type { SqlDriver } from "../timer/sqlDriver";

const KEY = "reminder.minutes";

/** BUILD_SPEC pinned default: 60 minutes. `0` means off. */
export const DEFAULT_REMINDER_MINUTES = 60;

/** Reads the persisted interval, or `DEFAULT_REMINDER_MINUTES` if never
 * set (a fresh database, or a value that fails to parse as a finite
 * number — defensive against a corrupted row, never throws). */
export async function getReminderMinutes(driver: SqlDriver): Promise<number> {
  const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY]);
  const row = rows[0];
  if (!row) return DEFAULT_REMINDER_MINUTES;
  const parsed = Number.parseInt(row.value, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_REMINDER_MINUTES;
}

/** Persists `minutes` (an upsert — the settings table's `key` is a primary
 * key, so a second call for the same key must overwrite, not throw a
 * UNIQUE-constraint error). `0` is a valid, meaningful value ("off") and
 * round-trips exactly like any other. */
export async function setReminderMinutes(driver: SqlDriver, minutes: number): Promise<void> {
  await driver.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEY, String(minutes)],
  );
}
