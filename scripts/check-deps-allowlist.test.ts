import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { findViolations, namesFromCargoLock, namesFromPackageLock, parseAllowlist } from "./check-deps-allowlist.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(HERE, "check-deps-allowlist.mjs");

const CLEAN_ALLOWLIST = `# npm
## npm
react
react-dom

## cargo
tauri
serde
`;

const PACKAGE_LOCK_CLEAN = JSON.stringify({
  name: "fixture",
  lockfileVersion: 3,
  packages: {
    "": { name: "fixture" },
    "node_modules/react": { name: "react", version: "19.0.0" },
    "node_modules/react-dom": { name: "react-dom", version: "19.0.0" },
  },
});

const PACKAGE_LOCK_WITH_ROGUE_DEP = JSON.stringify({
  name: "fixture",
  lockfileVersion: 3,
  packages: {
    "": { name: "fixture" },
    "node_modules/react": { name: "react", version: "19.0.0" },
    "node_modules/left-pad": { name: "left-pad", version: "1.3.0" },
  },
});

const CARGO_LOCK_CLEAN = `[[package]]
name = "tauri"
version = "2.0.0"

[[package]]
name = "serde"
version = "1.0.0"
`;

const CARGO_LOCK_WITH_ROGUE_DEP = `[[package]]
name = "tauri"
version = "2.0.0"

[[package]]
name = "reqwest"
version = "0.12.0"
`;

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

function makeFixture(opts: {
  allowlist?: string;
  packageLock?: string;
  cargoLock?: string;
}): string {
  const dir = mkdtempSync(join(tmpdir(), "ttt-deps-allowlist-"));
  if (opts.allowlist !== undefined) {
    writeFileSync(join(dir, "deps-allowlist.txt"), opts.allowlist, "utf8");
  }
  if (opts.packageLock !== undefined) {
    writeFileSync(join(dir, "package-lock.json"), opts.packageLock, "utf8");
  }
  if (opts.cargoLock !== undefined) {
    mkdirSync(join(dir, "src-tauri"), { recursive: true });
    writeFileSync(join(dir, "src-tauri", "Cargo.lock"), opts.cargoLock, "utf8");
  }
  fixtureDir = dir;
  return dir;
}

function runCli(dir: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [SCRIPT_PATH, dir], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("check-deps-allowlist.mjs — real subprocess against fixture trees", () => {
  it("exits 0 when every locked dependency is allowlisted", () => {
    const dir = makeFixture({
      allowlist: CLEAN_ALLOWLIST,
      packageLock: PACKAGE_LOCK_CLEAN,
      cargoLock: CARGO_LOCK_CLEAN,
    });

    const result = runCli(dir);
    expect(result.stdout).toMatch(/passed/i);
    expect(result.status).toBe(0);
  });

  it("exits non-zero when package-lock.json has a dependency absent from the allowlist", () => {
    const dir = makeFixture({
      allowlist: CLEAN_ALLOWLIST,
      packageLock: PACKAGE_LOCK_WITH_ROGUE_DEP,
      cargoLock: CARGO_LOCK_CLEAN,
    });

    const result = runCli(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/left-pad/);
  });

  it("exits non-zero when Cargo.lock has a dependency absent from the allowlist", () => {
    const dir = makeFixture({
      allowlist: CLEAN_ALLOWLIST,
      packageLock: PACKAGE_LOCK_CLEAN,
      cargoLock: CARGO_LOCK_WITH_ROGUE_DEP,
    });

    const result = runCli(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/reqwest/);
  });

  it("exits non-zero when deps-allowlist.txt is missing entirely", () => {
    const dir = makeFixture({ packageLock: PACKAGE_LOCK_CLEAN, cargoLock: CARGO_LOCK_CLEAN });
    const result = runCli(dir);
    expect(result.status).not.toBe(0);
  });
});

describe("parsing helpers — direct unit tests", () => {
  it("parseAllowlist splits npm and cargo sections and ignores comments", () => {
    const { npm, cargo } = parseAllowlist(CLEAN_ALLOWLIST);
    expect([...npm].sort()).toEqual(["react", "react-dom"]);
    expect([...cargo].sort()).toEqual(["serde", "tauri"]);
  });

  it("namesFromPackageLock extracts package names, excluding the root", () => {
    const names = namesFromPackageLock(PACKAGE_LOCK_CLEAN);
    expect([...names].sort()).toEqual(["react", "react-dom"]);
    expect(names.has("fixture")).toBe(false);
  });

  it("namesFromCargoLock extracts every [[package]] name", () => {
    const names = namesFromCargoLock(CARGO_LOCK_CLEAN);
    expect([...names].sort()).toEqual(["serde", "tauri"]);
  });
});

describe("findViolations() — direct unit tests", () => {
  it("returns an empty array for a clean tree", () => {
    const dir = makeFixture({
      allowlist: CLEAN_ALLOWLIST,
      packageLock: PACKAGE_LOCK_CLEAN,
      cargoLock: CARGO_LOCK_CLEAN,
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("reports both an npm and a cargo violation together", () => {
    const dir = makeFixture({
      allowlist: CLEAN_ALLOWLIST,
      packageLock: PACKAGE_LOCK_WITH_ROGUE_DEP,
      cargoLock: CARGO_LOCK_WITH_ROGUE_DEP,
    });
    const violations = findViolations(dir);
    expect(violations.some((v) => v.includes("left-pad"))).toBe(true);
    expect(violations.some((v) => v.includes("reqwest"))).toBe(true);
  });
});
