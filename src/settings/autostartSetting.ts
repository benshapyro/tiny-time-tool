// S12: `autostart` is a pinned settings key (BUILD_SPEC "Pinned interfaces"
// -> Settings keys: "autostart (true)"), persisted the same way as every
// other setting in this file's siblings. decisions.md #29: "Launch at login
// default on; setting to disable" — so the default here, unlike every other
// boolean-shaped thing in this project, is `true`, not `false`.
//
// This module owns ONLY the persisted user INTENT. Reconciling the real OS
// autostart registration to match that intent (via `AutostartDriver`) is
// `SettingsController`'s job, run once at boot and again on every toggle —
// same "persistence and live behaviour are deliberately separate" split as
// `reminderSettings.ts` vs. `ReminderController.setMinutes`.

import type { SqlDriver } from "../timer/sqlDriver";

const KEY = "autostart";

/** decisions.md #29: launch-at-login defaults to ON. */
export const DEFAULT_AUTOSTART = true;

/** Reads the persisted intent, or `DEFAULT_AUTOSTART` if never set (a fresh
 * database, or a corrupted value — defensive, never throws). Stored as the
 * literal strings "true"/"false", matching this table's TEXT column and
 * every other setting's plain-string convention. */
export async function getAutostartSetting(driver: SqlDriver): Promise<boolean> {
  const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY]);
  const row = rows[0];
  if (!row) return DEFAULT_AUTOSTART;
  if (row.value === "true") return true;
  if (row.value === "false") return false;
  return DEFAULT_AUTOSTART;
}

/** Persists `enabled` (upsert, same reasoning as every other setting). */
export async function setAutostartSetting(driver: SqlDriver, enabled: boolean): Promise<void> {
  await driver.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEY, enabled ? "true" : "false"],
  );
}
