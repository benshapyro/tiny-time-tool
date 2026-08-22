// S12: `shortcut.primary` / `shortcut.stop` are pinned settings keys
// (BUILD_SPEC "Pinned interfaces" -> Settings keys), persisted the same way
// as `languageSetting.ts`/`themeSetting.ts`. S3's `ShortcutController` holds
// the LIVE accelerator in memory and exposes `rebind()` to change it; this
// module is the seam that makes a rebind survive a restart — S3 deliberately
// left persistence out of `ShortcutController` itself (see that module's
// doc comment: "the path a later Settings slice (S12) calls").
//
// `bootstrap.ts` reads these at boot and passes them as
// `ShortcutController`'s `accelerators` override so a prior rebind is
// honoured from the very first `registerAll()` call, not just applied after
// the fact.

import { DEFAULT_ACCELERATORS } from "../shortcuts/shortcutController";
import type { ShortcutId } from "../shortcuts/shortcutController";
import type { SqlDriver } from "../timer/sqlDriver";

const KEY_FOR: Record<ShortcutId, string> = {
  primary: "shortcut.primary",
  stop: "shortcut.stop",
};

/** Reads the persisted accelerator for `id`, or its pinned default
 * (`DEFAULT_ACCELERATORS`) if never set — a fresh database, or an empty
 * stored value (defensive: an empty accelerator string is never valid,
 * never throws). */
export async function getShortcutSetting(driver: SqlDriver, id: ShortcutId): Promise<string> {
  const rows = await driver.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY_FOR[id]]);
  const row = rows[0];
  if (!row || row.value.trim() === "") return DEFAULT_ACCELERATORS[id];
  return row.value;
}

/** Persists the accelerator currently assigned to `id` (upsert, same
 * reasoning as every other setting in this project). */
export async function setShortcutSetting(driver: SqlDriver, id: ShortcutId, accelerator: string): Promise<void> {
  await driver.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEY_FOR[id], accelerator],
  );
}
