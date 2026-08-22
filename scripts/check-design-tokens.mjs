#!/usr/bin/env node
// Design-token gate. Fails (non-zero exit) if any component stylesheet uses a
// literal colour or pixel value instead of a token from
// `src/styles/tokens.css`. Deny-by-default: `tokens.css` is the one file
// allowed to define raw values, and everything else must reference them.
//
// WHY THIS EXISTS — CLAUDE.md non-negotiable #4 says "every style value comes
// from the design tokens", and until now that was enforced by eyeballing. It
// was enforced badly. The coordinator's own spot-checks across S4 and S5 used
// `grep ... | grep -v "var("`, which drops any line containing a token even
// when the SAME line also carries a literal — so `border: 1px solid
// var(--color-border)` was silently reported as clean. Fourteen hairline
// literals accumulated across four stylesheets while three consecutive slices
// reported "tokens only, no literals". One `min-width` literal was caught, but
// only because a reviewer read the file rather than trusting the check.
//
// A check that cannot see the thing it guards is the failure this project
// keeps rediscovering, so this one inspects the raw line and is tested
// against a fixture containing exactly that mixed-line shape.
//
// An earlier draft stripped `var(...)` before matching, on the theory that
// tokens hid literals. A drill proved that wrong — the literal is visible
// either way — and worse, stripping erased literal *fallbacks* like
// `var(--x, 8px)`, creating the very blind spot the gate exists to close.
// Removed, and a fallback test added.
//
// Usage: node scripts/check-design-tokens.mjs [rootDir]

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** The single file permitted to define raw values. */
export const TOKENS_FILE = join("src", "styles", "tokens.css");

const HEX_COLOUR = /#[0-9a-fA-F]{3,8}\b/;
const PIXEL_VALUE = /\b\d+px\b/;
/** Bare colour keywords that bypass the palette just as effectively as hex. */
const RAW_COLOUR_WORD = /(?:^|[\s:])(?:red|blue|green|black|white|grey|gray|orange|yellow|purple)(?=[\s;,)]|$)/i;

/** Values that carry no design intent and would be noise to tokenize. */
const INERT = new Set(["0", "0px", "transparent", "currentColor", "inherit", "none", "unset", "initial"]);

export function findViolations(rootDir) {
  const violations = [];
  const cssRoot = join(rootDir, "src");

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
      if (!entry.endsWith(".css")) continue;

      const rel = relative(rootDir, full);
      if (rel.split(sep).join("/") === TOKENS_FILE.split(sep).join("/")) continue;

      const relPosix = rel.split(sep).join("/");
      const lines = readFileSync(full, "utf8").split("\n");
      lines.forEach((rawLine, i) => {
        // Inspect the raw line: a literal is a literal whether or not a
        // token sits beside it, and a literal var() fallback still counts.
        const line = rawLine.split("/*")[0] ?? "";
        if (INERT.has(line.trim())) return;
        // 0px carries no design intent, so it is not a violation on its own;
        // any other pixel value is.
        const meaningfulPx = line.match(PIXEL_VALUE) !== null && /\b(?!0px\b)\d+px\b/.test(line);
        const hit =
          (HEX_COLOUR.test(line) && "a literal colour") ||
          (meaningfulPx && "a literal pixel value") ||
          (RAW_COLOUR_WORD.test(line) && "a raw colour keyword");
        if (hit) {
          violations.push(`${relPosix}:${i + 1}: ${hit} — ${rawLine.trim()}`);
        }
      });
    }
  };

  walk(cssRoot);
  return violations;
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const violations = findViolations(rootDir);

  if (violations.length > 0) {
    console.error("Design-token check FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      `\n${violations.length} violation(s). Component CSS must reference tokens` +
        ` from src/styles/tokens.css, never raw values (CLAUDE.md #4). Add a` +
        ` token if none fits — that is a design decision worth making once.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("Design-token check passed: no literal colours or pixel values outside tokens.css.");
  process.exitCode = 0;
}

// See check-zero-network.mjs for why the naive `file://` + argv[1] comparison
// silently disables a gate on Windows.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
