// Persistence seam: `TimerEngine` (timerEngine.ts) talks only to this
// interface, never to a concrete database library. Two real implementations
// share it:
//   - `nodeSqliteDriver.ts` — a real SQLite file via Node's built-in
//     `node:sqlite`, used by every test in this slice (BUILD_SPEC S2:
//     rehydration "must use a real SQLite file in a temp dir, not an
//     in-memory mock").
//   - `tauriSqlDriver.ts` — the official `@tauri-apps/plugin-sql`, used by
//     the real app (IPC to the Rust `tauri-plugin-sql` plugin registered in
//     `src-tauri/src/lib.rs`).
// Both point at the same schema (`src-tauri/migrations/0001_init.sql`) and
// accept plain `?`-style positional placeholders, so the same query text
// works unmodified against either driver.

export interface QueryResult {
  rowsAffected: number;
  lastInsertId: number | string | null;
}

export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}
