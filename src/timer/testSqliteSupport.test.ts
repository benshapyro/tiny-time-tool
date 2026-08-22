// Guards the teardown helper itself. Without this, `closeTrackedDrivers()`
// could quietly become a no-op and every suite would still pass on macOS —
// where deleting an open file is legal — while failing on Windows with EPERM,
// which is exactly how the original defect stayed invisible.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "./testSqliteSupport";

let tempDir: string;

afterEach(async () => {
  await closeTrackedDrivers();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("tracked SQLite driver teardown", () => {
  it("closeTrackedDrivers actually closes the handle — a later query must fail", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ttt-teardown-"));
    const driver = trackDriver(join(tempDir, "t.db"));
    await driver.execute("CREATE TABLE t (id TEXT)");

    // Works while open.
    await expect(driver.select("SELECT * FROM t")).resolves.toEqual([]);

    await closeTrackedDrivers();

    // If close() were a no-op this would still resolve, and the Windows
    // EPERM failure would silently return.
    await expect(driver.select("SELECT * FROM t")).rejects.toThrow();
  });

  it("is safe to call with nothing open, and does not re-close twice", async () => {
    await expect(closeTrackedDrivers()).resolves.toBeUndefined();
    tempDir = mkdtempSync(join(tmpdir(), "ttt-teardown-"));
    trackDriver(join(tempDir, "t.db"));
    await closeTrackedDrivers();
    await expect(closeTrackedDrivers()).resolves.toBeUndefined();
  });
});
