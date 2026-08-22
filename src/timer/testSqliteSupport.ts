// Test-only support for the real-SQLite drivers.
//
// WHY THIS EXISTS — a cross-platform defect found by CI on windows-latest:
// every test that opened a `nodeSqliteDriver` left the SQLite file handle
// open, then `afterEach` tried to `rmSync` the temp directory. On macOS and
// Linux, deleting an open file succeeds, so the leak was invisible. On
// Windows it is an error, and all 13 timer tests failed with:
//
//     Error: EPERM, Permission denied: \\?\C:\Users\RUNNER~1\AppData\Local\Temp\ttt-s2-...
//
// The tests were the visible casualty, but the leak was real on every
// platform — `SqlDriver.close()` existed on both drivers and nothing ever
// called it.
//
// Route every test driver through `trackDriver` and call
// `closeTrackedDrivers()` in `afterEach` BEFORE removing the temp dir, so the
// right thing is the easy thing for later slices.
//
// This module is imported only by `*.test.ts` files, so it never reaches the
// production bundle (which cannot use `node:sqlite` anyway — the app talks to
// `tauri-plugin-sql` through `tauriSqlDriver.ts`).

import { createNodeSqliteDriver } from "./nodeSqliteDriver";
import type { SqlDriver } from "./sqlDriver";

const open: SqlDriver[] = [];

/** Opens a real SQLite driver against `dbPath` and registers it for teardown. */
export function trackDriver(dbPath: string): SqlDriver {
  const driver = createNodeSqliteDriver(dbPath);
  open.push(driver);
  return driver;
}

/**
 * Closes every driver opened via `trackDriver` since the last call. Safe to
 * call when none are open. Individual close failures are swallowed: a driver
 * whose underlying database is already closed must not mask the real
 * assertion failure that a test is reporting.
 */
export async function closeTrackedDrivers(): Promise<void> {
  for (const driver of open.splice(0)) {
    try {
      await driver.close();
    } catch {
      // Already closed, or closed by the test itself — not a test failure.
    }
  }
}
