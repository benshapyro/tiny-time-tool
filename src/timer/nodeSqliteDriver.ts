// Real-SQLite `SqlDriver` for tests (and any future non-Tauri context),
// backed by Node's built-in `node:sqlite` (no new dependency — it ships
// with the Node version this project targets; verified stable, no
// `--experimental-sqlite` flag or warning, on Node v26.7.0 this session).
//
// Applies the schema from every `src-tauri/migrations/*.sql` file, in
// filename order — the same files the real app applies via the Rust
// plugin's sqlx migrator (see `src-tauri/src/lib.rs`). One set of files, two
// readers, no drift. Since this driver has no migration-version tracker of
// its own, each file's `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT
// EXISTS` guards make re-opening an existing database file a no-op rather
// than an error.

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { QueryResult, SqlDriver } from "./sqlDriver";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "src-tauri", "migrations");

function readAllMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .join("\n");
}

/** Opens (creating if needed) a real SQLite file at `filePath` and applies
 * the pinned schema (every migration file, in order). Every `execute`/
 * `select` call is wrapped in a resolved Promise to match the (genuinely
 * async, IPC-backed) `SqlDriver` contract, even though `node:sqlite` itself
 * is synchronous. */
export function createNodeSqliteDriver(filePath: string): SqlDriver {
  const db = new DatabaseSync(filePath);
  db.exec(readAllMigrations());

  return {
    async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
      const result = db.prepare(sql).run(...(params as SQLInputValue[]));
      return {
        rowsAffected: Number(result.changes),
        lastInsertId: Number(result.lastInsertRowid),
      };
    },

    async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...(params as SQLInputValue[])) as T[];
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
