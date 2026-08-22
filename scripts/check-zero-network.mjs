#!/usr/bin/env node
// Zero-network mechanism (c): source scan. Fails (non-zero exit) if any of
// the forbidden network-capable patterns appear anywhere in `src/**` or
// `src-tauri/src/**`, EXCEPT inside the single allowlisted plumbing file
// `src-tauri/src/os_integration.rs`. Reads actual file contents (not just
// filenames) so a renamed or disguised call site still gets caught.
//
// Usage: node scripts/check-zero-network.mjs [rootDir]
// `rootDir` defaults to the current working directory; tests pass a
// temporary fixture tree so the check's real behaviour is exercised without
// touching the repo itself.

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const FORBIDDEN_PATTERNS = [
  "std::net",
  "std::process::Command",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "sendBeacon",
];

const SCAN_ROOTS = ["src", join("src-tauri", "src")];
const ALLOWLISTED_RELATIVE_PATH = join("src-tauri", "src", "os_integration.rs");

function toPosix(p) {
  return p.split(sep).join("/");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scans the given root directory and returns a list of violation strings.
 * An empty array means the tree is clean.
 */
export function findViolations(rootDir) {
  const violations = [];

  for (const scanRoot of SCAN_ROOTS) {
    const dir = join(rootDir, scanRoot);
    let files;
    try {
      files = walk(dir);
    } catch (err) {
      if (err && err.code === "ENOENT") continue; // nothing to scan there
      throw err;
    }

    for (const file of files) {
      const rel = toPosix(relative(rootDir, file));
      if (rel === toPosix(ALLOWLISTED_RELATIVE_PATH)) continue;

      const contents = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (contents.includes(pattern)) {
          violations.push(`${rel}: contains forbidden pattern "${pattern}"`);
        }
      }
    }
  }

  return violations;
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const violations = findViolations(rootDir);

  if (violations.length > 0) {
    console.error("Zero-network source scan FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      `\n${violations.length} violation(s). Network-capable APIs are only allowed in src-tauri/src/os_integration.rs.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "Zero-network source scan passed: no forbidden network APIs found outside os_integration.rs.",
  );
  process.exitCode = 0;
}

// Only run as a CLI when invoked directly (not when imported by tests).
//
// Compare real file URLs, not a hand-built `file://` + path string. The naive
// form silently evaluates to false whenever the path needs URL encoding (a
// space in a directory name) and on EVERY Windows path (`file://C:\...` never
// equals `file:///C:/...`). The failure mode is the dangerous direction: the
// CLI body never runs, the process exits 0, and CI reports a green
// zero-network check that scanned nothing at all.
//
// `realpathSync` matters too: Node's ESM loader resolves symlinks when it
// builds `import.meta.url`, but `process.argv[1]` is the literal string the
// caller typed. Invoked through a symlinked directory (macOS `/tmp` →
// `/private/tmp`, or any symlinked checkout) the two would disagree and the
// gate would go quiet again.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
