-- S2: entry/segment schema (BUILD_SPEC "Pinned interfaces").
--
-- This is the single source of truth for the schema. Two things apply it:
--   - the real Tauri app, via `tauri_plugin_sql::Migration` in
--     `src-tauri/src/lib.rs` (`include_str!`'d from this file, run through
--     the plugin's own sqlx migrator, which tracks applied versions);
--   - Vitest, via `src/timer/nodeSqliteDriver.ts`, which reads this same
--     file and executes it verbatim against a real SQLite file in a temp
--     dir (`CREATE TABLE IF NOT EXISTS` makes re-running it on an existing
--     file a no-op, since the Node driver has no migration-version tracker
--     of its own).
--
-- `time_entries` / `segments` mirror the pinned TS interfaces exactly:
--   TimeEntry { id, name, client, project, createdAt }
--   Segment   { id, entryId, startedAt, endedAt }
-- Duration is always derived (sum of segments) — never stored.
-- `name`/`client`/`project` are nullable and stored as NULL, never as a
-- baked-in display string (BUILD_SPEC: "name: null is stored as null ...
-- never bake the auto-name into storage").

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  client TEXT,
  project TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES time_entries(id),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_segments_entry_id ON segments(entry_id);
CREATE INDEX IF NOT EXISTS idx_segments_open ON segments(ended_at);
