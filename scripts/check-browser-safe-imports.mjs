#!/usr/bin/env node
// Browser-safety gate. Fails (non-zero exit) if any file that can reach the
// frontend bundle imports a Node built-in (`node:*`, or the bare legacy
// specifiers). Deny-by-default: an explicit allowlist names the files that
// are test-only and therefore never bundled; everything else is refused by
// absence.
//
// WHY THIS EXISTS — a defect that passed every gate we had. S2 shipped
// `import { randomUUID } from "node:crypto"` in src/timer/timerEngine.ts.
// It was fine under Vitest and fine under `tsc`, and `vite build` exited 0
// because Rollup treats an unresolvable `node:` builtin as an external and
// merely warns. But `node:crypto` does not exist in a WKWebView, so the
// import aborted the whole main.tsx module graph and NEITHER WINDOW
// RENDERED. Tests green, cargo green, CI green on both platforms, installers
// built — and the app could not draw a pixel.
//
// It surfaced only because S4 became the first slice whose frontend bundle
// actually imported TimerEngine. Nothing before it ever executed that file
// outside a test runner. Had S4 not needed it, this ships to the pilot.
//
// A green build for broken code is the exact failure class verification.md
// exists to catch, so this gate is deliberately mechanical and deny-by-
// default rather than a lint rule someone can wave through.
//
// Usage: node scripts/check-browser-safe-imports.mjs [rootDir]

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** Files permitted to import Node built-ins: test-only, never bundled.
 *  Add to this list ONLY with a reason, and only for files that no
 *  production module graph can reach. */
export const ALLOWLISTED = [
  join("src", "timer", "nodeSqliteDriver.ts"), // real-SQLite driver, tests only
  join("src", "timer", "testSqliteSupport.ts"), // teardown helper, tests only
];

/** `import ... from "node:x"` / `require("node:x")`, plus bare legacy names. */
const BARE_BUILTINS = [
  "crypto", "fs", "path", "os", "child_process", "worker_threads",
  "http", "https", "net", "tls", "dns", "zlib", "stream", "buffer",
  "util", "url", "sqlite", "process", "module", "vm", "cluster",
];

export function findViolations(rootDir) {
  const violations = [];
  const srcRoot = join(rootDir, "src");

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch (err) {
      if (err && err.code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) continue;

      const rel = relative(rootDir, full);
      const relPosix = rel.split(sep).join("/");

      // Test files are never bundled.
      if (/\.test\.(ts|tsx|js|jsx)$/.test(entry)) continue;
      if (ALLOWLISTED.some((a) => a.split(sep).join("/") === relPosix)) continue;

      const text = readFileSync(full, "utf8");

      const nodePrefixed = text.match(/from\s+["']node:([a-z_/]+)["']|require\(\s*["']node:([a-z_/]+)["']/g);
      if (nodePrefixed) {
        for (const hit of new Set(nodePrefixed)) {
          violations.push(`${relPosix}: imports a Node built-in — ${hit.trim()}`);
        }
      }
      for (const mod of BARE_BUILTINS) {
        const bare = new RegExp(`from\\s+["']${mod}["']`, "g");
        if (bare.test(text)) {
          violations.push(`${relPosix}: imports the bare Node built-in "${mod}"`);
        }
      }
    }
  };

  walk(srcRoot);
  return violations;
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const violations = findViolations(rootDir);

  if (violations.length > 0) {
    console.error("Browser-safety check FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      `\n${violations.length} violation(s). Node built-ins do not exist in the` +
        ` webview; importing one aborts the module graph at runtime while` +
        ` vite build still exits 0. Use a Web API (e.g. crypto.randomUUID()),` +
        ` or move the code behind a driver seam and allowlist the test-only file.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("Browser-safety check passed: no Node built-ins reachable from the frontend bundle.");
  process.exitCode = 0;
}

// Real file-URL comparison; see check-zero-network.mjs for why the naive
// `file://` + argv[1] form silently disables the gate on Windows.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
