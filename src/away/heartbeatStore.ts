// S9: `away.lastHeartbeat` — persisted in the existing `settings` key-value
// table (migration 0002_settings.sql), the same seam `firstLaunchFlag.ts`
// and `reminderSettings.ts` already use, rather than a new table. Must
// survive process death (BUILD_SPEC: "heartbeat timestamp persisted every
// 30s while running" — the whole mechanism the away-gap check depends on),
// so it lives in SQLite, never in memory.
//
// One row, storing the ISO8601 timestamp of the last confirmed-alive tick
// while a timer was running. `AwayGapController` owns when this is written
// and read; this module is only the plumbing, mirroring reminderSettings.ts.

import type { SqlDriver } from "../timer/sqlDriver";

const KEY = "away.lastHeartbeat";

/** Reads the persisted heartbeat, or `null` if none has ever been written
 * (a fresh database, or after `clearLastHeartbeat`). */
export async function getLastHeartbeat(driver: SqlDriver): Promise<string | null> {
  const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY]);
  return rows[0]?.value ?? null;
}

/** Persists `iso` as the latest heartbeat (an upsert — `settings.key` is a
 * primary key, so a second write for the same key overwrites rather than
 * throwing a UNIQUE-constraint error). */
export async function setLastHeartbeat(driver: SqlDriver, iso: string): Promise<void> {
  await driver.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEY, iso],
  );
}

/** Removes the stored heartbeat entirely. Not currently called by
 * production wiring (the baseline-floor logic in `AwayGapController.check`
 * already makes a stale heartbeat harmless — see that module's doc
 * comment), but kept as a small, testable, explicit reset primitive rather
 * than requiring a caller to know the sentinel value to overwrite with. */
export async function clearLastHeartbeat(driver: SqlDriver): Promise<void> {
  await driver.execute("DELETE FROM settings WHERE key = ?", [KEY]);
}
