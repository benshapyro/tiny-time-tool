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
