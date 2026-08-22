// S12: `language` is a pinned settings key (BUILD_SPEC "Pinned interfaces" ->
// Settings keys: "language (system|en|es)"), persisted in the existing
// `settings` key-value table (migration 0002_settings.sql) — the same seam
// `firstLaunchFlag.ts`/`reminderSettings.ts` already use. Mirrors
// `reminderSettings.ts`'s shape exactly: a getter with a safe default for a
// fresh/corrupted row, and an upsert setter.
//
// This module owns ONLY the persisted raw setting ("system" | "en" | "es").
// Resolving "system" to an actual `Locale` ("en" | "es") is a separate, pure
// concern — see `resolveLocale.ts` — so that resolution stays unit-testable
// without a database at all.

import type { SqlDriver } from "../timer/sqlDriver";

const KEY = "language";

export type LanguageSetting = "system" | "en" | "es";

/** BUILD_SPEC pins the language setting to default to following the OS
 * (decisions.md #35: "language setting defaults to follow OS"). */
export const DEFAULT_LANGUAGE_SETTING: LanguageSetting = "system";

function isLanguageSetting(value: string): value is LanguageSetting {
  return value === "system" || value === "en" || value === "es";
}

/** Reads the persisted setting, or `DEFAULT_LANGUAGE_SETTING` if never set
 * (a fresh database, or a corrupted/unrecognized value — defensive, never
 * throws). */
export async function getLanguageSetting(driver: SqlDriver): Promise<LanguageSetting> {
  const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY]);
  const row = rows[0];
  if (!row) return DEFAULT_LANGUAGE_SETTING;
  return isLanguageSetting(row.value) ? row.value : DEFAULT_LANGUAGE_SETTING;
}

/** Persists `language` (upsert — the settings table's `key` is a primary
 * key, so a second call for the same key must overwrite, not throw a
 * UNIQUE-constraint error). */
export async function setLanguageSetting(driver: SqlDriver, language: LanguageSetting): Promise<void> {
  await driver.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEY, language],
  );
}
