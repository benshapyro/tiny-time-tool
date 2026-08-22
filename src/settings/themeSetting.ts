// S12: `theme` is a pinned settings key (BUILD_SPEC "Pinned interfaces" ->
// Settings keys: "theme (system|light|dark)"), persisted the same way as
// `languageSetting.ts` — see that module's doc comment for the shared
// reasoning. Persistence and DOM application are deliberately separate
// concerns: `applyTheme.ts` is the pure function that actually flips
// `[data-theme]`, unit-testable without a database.

import type { SqlDriver } from "../timer/sqlDriver";

const KEY = "theme";

export type ThemeSetting = "system" | "light" | "dark";

/** BUILD_SPEC's tokens.css already defaults to OS-sync
 * (`prefers-color-scheme`) absent an explicit choice — "system" matches
 * that existing default exactly. */
export const DEFAULT_THEME_SETTING: ThemeSetting = "system";

function isThemeSetting(value: string): value is ThemeSetting {
  return value === "system" || value === "light" || value === "dark";
}

/** Reads the persisted setting, or `DEFAULT_THEME_SETTING` if never set (a
 * fresh database, or a corrupted/unrecognized value — defensive, never
 * throws). */
export async function getThemeSetting(driver: SqlDriver): Promise<ThemeSetting> {
  const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY]);
  const row = rows[0];
  if (!row) return DEFAULT_THEME_SETTING;
  return isThemeSetting(row.value) ? row.value : DEFAULT_THEME_SETTING;
}

/** Persists `theme` (upsert, same reasoning as `setLanguageSetting`). */
export async function setThemeSetting(driver: SqlDriver, theme: ThemeSetting): Promise<void> {
  await driver.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEY, theme],
  );
}
