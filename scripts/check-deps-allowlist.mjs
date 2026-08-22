#!/usr/bin/env node
// Zero-network mechanism (b): dependency allowlist. Fails (non-zero exit)
// if package-lock.json or src-tauri/Cargo.lock contains any dependency
// name that isn't listed in deps-allowlist.txt. New dependencies require a
// human-reviewed allowlist change in the same PR.
//
// Usage: node scripts/check-deps-allowlist.mjs [rootDir]
// `rootDir` defaults to the current working directory; tests pass a
// temporary fixture tree (allowlist + lockfiles) so the check's real
// behaviour is exercised without touching the repo's real lockfiles.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Parses deps-allowlist.txt into { npm: Set, cargo: Set } by section. */
export function parseAllowlist(text) {
  const npm = new Set();
  const cargo = new Set();
  let current = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (/^#+\s*npm\b/i.test(line)) {
      current = npm;
      continue;
    }
    if (/^#+\s*cargo\b/i.test(line)) {
      current = cargo;
      continue;
    }
    if (line.startsWith("#")) continue; // plain comment
    if (!current) continue; // stray line before any section header
    current.add(line);
  }

  return { npm, cargo };
}

/** Extracts every package name referenced in a package-lock.json (v2/v3). */
export function namesFromPackageLock(text) {
  const json = JSON.parse(text);
  const names = new Set();

  if (json.packages && typeof json.packages === "object") {
    for (const [pkgPath, meta] of Object.entries(json.packages)) {
      if (pkgPath === "") continue; // the root project itself
      const derivedName = pkgPath.replace(/^.*node_modules\//, "");
      const name = (meta && meta.name) || derivedName;
      if (name) names.add(name);
    }
  }

  // lockfileVersion 1 fallback (flat `dependencies` map).
  if (json.dependencies && typeof json.dependencies === "object") {
    for (const name of Object.keys(json.dependencies)) names.add(name);
  }

  return names;
}

/** Extracts every `[[package]] name = "..."` entry from a Cargo.lock. */
export function namesFromCargoLock(text) {
  const names = new Set();
  const re = /^name\s*=\s*"([^"]+)"/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    names.add(match[1]);
  }
  return names;
}

/**
 * Checks the given root directory's lockfiles against its deps-allowlist.txt
 * and returns a list of violation strings. An empty array means clean.
 */
export function findViolations(rootDir) {
  const violations = [];

  const allowlistPath = join(rootDir, "deps-allowlist.txt");
  if (!existsSync(allowlistPath)) {
    return [`missing deps-allowlist.txt at ${allowlistPath}`];
  }
  const { npm: allowedNpm, cargo: allowedCargo } = parseAllowlist(
    readFileSync(allowlistPath, "utf8"),
  );

  const packageLockPath = join(rootDir, "package-lock.json");
  if (existsSync(packageLockPath)) {
    const npmNames = namesFromPackageLock(readFileSync(packageLockPath, "utf8"));
    for (const name of npmNames) {
      if (!allowedNpm.has(name)) {
        violations.push(`npm dependency "${name}" is not in deps-allowlist.txt`);
      }
    }
  } else {
    violations.push(`missing package-lock.json at ${packageLockPath}`);
  }

  const cargoLockPath = join(rootDir, "src-tauri", "Cargo.lock");
  if (existsSync(cargoLockPath)) {
    const cargoNames = namesFromCargoLock(readFileSync(cargoLockPath, "utf8"));
    for (const name of cargoNames) {
      if (!allowedCargo.has(name)) {
        violations.push(`cargo dependency "${name}" is not in deps-allowlist.txt`);
      }
    }
  } else {
    violations.push(`missing Cargo.lock at ${cargoLockPath}`);
  }

  return violations;
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const violations = findViolations(rootDir);

  if (violations.length > 0) {
    console.error("Dependency allowlist check FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(`\n${violations.length} violation(s). Add reviewed new deps to deps-allowlist.txt.`);
    process.exitCode = 1;
    return;
  }

  console.log("Dependency allowlist check passed: every locked dependency is allowlisted.");
  process.exitCode = 0;
}

// Only run as a CLI when invoked directly (not when imported by tests).
// See the note in check-zero-network.mjs: a hand-built `file://` + path
// string is false for any URL-encoded path and for every Windows path, which
// would make this CI gate exit 0 without ever reading a lockfile.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
