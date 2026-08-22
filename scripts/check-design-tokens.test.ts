// Proves the design-token gate sees what the informal check could not.
//
// The check this replaces was `grep ... | grep -v "var("`, which discards any
// line mentioning a token even when the same line also carries a literal. The
// mixed-line case below is therefore the single most important test here: it
// is the exact shape that slipped past three consecutive slices.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findViolations } from "./check-design-tokens.mjs";

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ttt-tokens-"));
  for (const [relPath, contents] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  fixtureDir = dir;
  return dir;
}

describe("design-token gate", () => {
  it("passes a stylesheet that only references tokens", () => {
    const dir = makeFixture({
      "src/a.css": ".x { color: var(--color-text-primary); padding: var(--space-2); }\n",
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("catches a literal sharing a line with a token — the case the old check missed", () => {
    const dir = makeFixture({
      "src/a.css": ".x { border: 1px solid var(--color-border); }\n",
    });
    const violations = findViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/literal pixel value/);
  });

  it("catches a hex colour", () => {
    const dir = makeFixture({ "src/a.css": ".x { color: #ff0000; }\n" });
    expect(findViolations(dir)).toHaveLength(1);
  });

  it("catches a raw colour keyword", () => {
    const dir = makeFixture({ "src/a.css": ".x { color: red; }\n" });
    expect(findViolations(dir)).toHaveLength(1);
  });

  it("allows tokens.css itself to define raw values — it is the palette", () => {
    const dir = makeFixture({
      "src/styles/tokens.css": ":root { --color-surface: #ffffff; --space-2: 8px; }\n",
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("does not flag 0px, which carries no design intent", () => {
    const dir = makeFixture({ "src/a.css": ".x { box-shadow: 0 0 0 var(--border-width-emphasis); }\n" });
    expect(findViolations(dir)).toEqual([]);
  });
});

// Added after a drill showed the gate's var()-stripping step was not only
// unnecessary but harmful: it erased literal fallbacks, hiding them.
describe("design-token gate — literal fallbacks inside var()", () => {
  it("flags a literal used as a var() fallback", () => {
    const dir = makeFixture({
      "src/a.css": ".x { padding: var(--space-2, 8px); }\n",
    });
    expect(findViolations(dir)).toHaveLength(1);
  });
});

// Both cases below were review findings on the gate itself: its first
// comment handling was `line.split("/*")[0]`, which failed in both
// directions. Neither was covered by the original fixtures, all of which
// were single-line and comment-free.
describe("design-token gate — comment handling", () => {
  it("still sees a violation that FOLLOWS an inline comment on the same line", () => {
    const dir = makeFixture({
      "src/a.css": ".x { /* hairline */ border: 1px solid #ff0000; }\n",
    });
    // Previously the split discarded everything after "/*", hiding both the
    // 1px and the hex entirely.
    expect(findViolations(dir).length).toBeGreaterThan(0);
  });

  it("does NOT flag prose inside a multi-line block comment", () => {
    const dir = makeFixture({
      "src/a.css": [
        "/*",
        " * Header. Uses a 1px hairline and red for errors.",
        " */",
        ".x { color: var(--color-text-primary); }",
      ].join("\n"),
    });
    // A continuation line has no "/*" of its own, so the old version scanned
    // it as CSS and would have failed CI on a comment.
    expect(findViolations(dir)).toEqual([]);
  });

  it("resumes checking after a block comment closes", () => {
    const dir = makeFixture({
      "src/a.css": "/* note */\n.x { padding: 12px; }\n",
    });
    const violations = findViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/:2:/);
  });
});

// Review findings on S6: the gate looked only for colours and px, so
// `line-height: 1` and `opacity: 0.5` sat in plain sight in a file the gate
// had just declared clean.
describe("design-token gate — unitless values that are still design decisions", () => {
  it("flags a bare line-height", () => {
    const dir = makeFixture({ "src/a.css": ".x { line-height: 1; }\n" });
    expect(findViolations(dir)).toHaveLength(1);
  });

  it("flags a bare opacity", () => {
    const dir = makeFixture({ "src/a.css": ".x { opacity: 0.5; }\n" });
    expect(findViolations(dir)).toHaveLength(1);
  });

  it("accepts the tokenized forms", () => {
    const dir = makeFixture({
      "src/a.css": ".x { line-height: var(--line-height-tight); opacity: var(--opacity-disabled); }\n",
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("leaves layout mechanics alone — z-index is not a palette decision", () => {
    const dir = makeFixture({ "src/a.css": ".x { z-index: 10; flex: 1; }\n" });
    expect(findViolations(dir)).toEqual([]);
  });
});
