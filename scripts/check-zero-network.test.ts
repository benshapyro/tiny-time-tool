import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { findViolations } from "./check-zero-network.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(HERE, "check-zero-network.mjs");

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ttt-zero-network-"));
  for (const [relPath, contents] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
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

describe("check-zero-network.mjs — real subprocess against fixture trees", () => {
  it("exits 0 on a clean tree", () => {
    const dir = makeFixture({
      "src/App.tsx": "export const App = () => null;\n",
      "src-tauri/src/lib.rs": "pub fn run() {}\n",
    });

    const result = runCli(dir);
    expect(result.stdout).toMatch(/passed/i);
    expect(result.status).toBe(0);
  });

  it("exits non-zero when fetch( appears in src/**", () => {
    const dir = makeFixture({
      "src/App.tsx": "fetch('https://example.com');\n",
    });

    const result = runCli(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/fetch\(/);
  });

  it("exits non-zero when std::net appears in src-tauri/src/**", () => {
    const dir = makeFixture({
      "src-tauri/src/lib.rs": "use std::net::TcpStream;\n",
    });

    const result = runCli(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/std::net/);
  });

  it("exits non-zero for each of the seven forbidden patterns", () => {
    const patterns = [
      "std::net",
      "std::process::Command",
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "sendBeacon",
    ];
    for (const pattern of patterns) {
      const dir = makeFixture({ "src/violation.ts": `const x = "${pattern}";\n` });
      const result = runCli(dir);
      expect(result.status, `expected violation for pattern: ${pattern}`).not.toBe(0);
      rmSync(dir, { recursive: true, force: true });
    }
    fixtureDir = undefined;
  });

  it("allows forbidden patterns ONLY inside src-tauri/src/os_integration.rs", () => {
    const dir = makeFixture({
      "src-tauri/src/os_integration.rs":
        "// allowlisted plumbing file\nuse std::net::IpAddr; // documented exception\n",
    });

    const result = runCli(dir);
    expect(result.status).toBe(0);
  });

  it("still flags a violation elsewhere even when os_integration.rs is clean", () => {
    const dir = makeFixture({
      "src-tauri/src/os_integration.rs": "// clean\n",
      "src-tauri/src/lib.rs": "std::process::Command::new(\"curl\");\n",
    });

    const result = runCli(dir);
    expect(result.status).not.toBe(0);
  });

  it("scans actual file contents, not just filenames", () => {
    // A file with an innocuous name but forbidden contents must still fail.
    const dir = makeFixture({
      "src/utils.ts": "export const send = () => new WebSocket('wss://x');\n",
    });

    const result = runCli(dir);
    expect(result.status).not.toBe(0);
  });
});

describe("findViolations() — direct unit tests", () => {
  it("returns an empty array for a clean tree", () => {
    const dir = makeFixture({ "src/App.tsx": "export {}\n" });
    expect(findViolations(dir)).toEqual([]);
  });

  it("returns a non-empty array describing the violation", () => {
    const dir = makeFixture({ "src/App.tsx": "sendBeacon('/x');\n" });
    const violations = findViolations(dir);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/sendBeacon/);
  });
});
