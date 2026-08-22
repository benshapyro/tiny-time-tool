// Proves the browser-safety gate detects real violations rather than just
// returning 0 on a clean tree. Fixture trees live in $TMPDIR, never the repo.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findViolations } from "./check-browser-safe-imports.mjs";

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ttt-browser-safe-"));
  for (const [relPath, contents] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  fixtureDir = dir;
  return dir;
}

describe("browser-safety gate", () => {
  it("passes a clean tree", () => {
    const dir = makeFixture({
      "src/App.tsx": "export const App = () => null;\n",
      "src/timer/x.ts": "export const id = () => crypto.randomUUID();\n",
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("catches THE bug that shipped in S2: node:crypto in a bundled file", () => {
    const dir = makeFixture({
      "src/timer/timerEngine.ts": 'import { randomUUID } from "node:crypto";\n',
    });
    const violations = findViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/timerEngine\.ts/);
    expect(violations[0]).toMatch(/node:crypto/);
  });

  it("catches bare legacy specifiers too, not just the node: prefix", () => {
    const dir = makeFixture({
      "src/a.ts": 'import { readFileSync } from "fs";\n',
    });
    expect(findViolations(dir)).toHaveLength(1);
  });

  it("ignores test files — they are never bundled", () => {
    const dir = makeFixture({
      "src/a.test.ts": 'import { tmpdir } from "node:os";\n',
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("ignores the named test-only drivers, and ONLY those", () => {
    const dir = makeFixture({
      "src/timer/nodeSqliteDriver.ts": 'import { DatabaseSync } from "node:sqlite";\n',
      "src/timer/testSqliteSupport.ts": 'import { x } from "node:fs";\n',
      // Same import, a file that is NOT allowlisted — must still be caught,
      // so the allowlist stays deny-by-default rather than a blanket pass.
      "src/timer/sneaky.ts": 'import { DatabaseSync } from "node:sqlite";\n',
    });
    const violations = findViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/sneaky\.ts/);
  });
});
