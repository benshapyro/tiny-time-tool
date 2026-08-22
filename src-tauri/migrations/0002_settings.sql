-- S5: a small generic key-value settings table. First consumer is the
-- popover's first-launch auto-open flag (`src/app/firstLaunchFlag.ts`,
-- key "popover.autoOpened") — persisted here rather than localStorage
-- because this app already has a durable, restart-survives persistence
-- layer via SqlDriver, and BUILD_SPEC's pinned "Settings keys" section
-- (shortcut.primary, reminder.minutes, language, theme, autostart) is the
-- same shape: S12 reuses this same table rather than inventing another.
--
-- Numbered 0002, applied after 0001_init.sql, per the project's "schema
-- migrations via numbered SQL files from v1" rule — never edits 0001.
-- Same two-reader pattern as 0001: the real app applies this via the Rust
-- `tauri-plugin-sql` migrator (`src-tauri/src/lib.rs`); Vitest applies the
-- same file verbatim against a real SQLite file
-- (`src/timer/nodeSqliteDriver.ts`).

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
