// Production `SqlDriver`, backed by the official `@tauri-apps/plugin-sql`
// (BUILD_SPEC: "Use the official tauri-plugin-sql"). Talks over Tauri's IPC
// bridge to the Rust `tauri-plugin-sql` plugin registered in
// `src-tauri/src/lib.rs`, which owns applying
// `src-tauri/migrations/0001_init.sql` on startup via its own sqlx
// migrator — this file does no migration work of its own.
//
// No unit test: `Database.load`/`execute`/`select` invoke Tauri's IPC
// bridge, which doesn't exist under Vitest/jsdom (and stubbing it would
// only prove the stub, not this glue). `TimerEngine`'s real behaviour is
// exercised against `nodeSqliteDriver` instead — a real SQLite file behind
// the same `SqlDriver` contract this file also implements. A later slice
// that wires a `TimerEngine` into the running app is what actually
// exercises this path, at the S14 manual-check gate.

import Database from "@tauri-apps/plugin-sql";
import type { QueryResult, SqlDriver } from "./sqlDriver";

const DB_URL = "sqlite:tiny-time-tool.db";

export async function createTauriSqlDriver(): Promise<SqlDriver> {
  const db = await Database.load(DB_URL);

  return {
    async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
      const result = await db.execute(sql, params);
      return {
        rowsAffected: result.rowsAffected,
        lastInsertId: result.lastInsertId ?? null,
      };
    },

    async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.select<T[]>(sql, params);
    },

    async close(): Promise<void> {
      await db.close(DB_URL);
    },
  };
}
