// Proves the no-hardcoded-strings lint both BITES and does not cry wolf.
//
// A lint that flags `className` or `data-testid` gets suppressed within a
// week and then guards nothing, so roughly half the cases below are
// false-positive guards: they pin the things the gate must stay silent
// about. The other half are the real shapes — a literal child, a literal
// `title`/`placeholder`/`alt`/`aria-label` — that CLAUDE.md #4 forbids.
//
// The last block points the gate at a REAL component with a hardcoded
// string injected into it, rather than trusting hand-written fixtures
// (verification.md F7: a check written in terms of the thing it checks
// cannot fail).

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findViolations } from "./check-no-hardcoded-strings.mjs";

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ttt-strings-"));
  for (const [relPath, contents] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  fixtureDir = dir;
  return dir;
}

/** Wraps a JSX body in a minimal component file. */
function component(body: string): string {
  return `import { t } from "../i18n";\n\nexport function Thing({ locale }: { locale: "en" | "es" }) {\n  return (\n${body}\n  );\n}\n`;
}

describe("no-hardcoded-strings lint — what it must catch", () => {
  it("flags literal text sitting directly inside an element", () => {
    const dir = makeFixture({ "src/x/Thing.tsx": component("    <button>Save</button>") });
    const violations = findViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Save");
  });

  it("flags a string literal used as a child expression", () => {
    const dir = makeFixture({ "src/x/Thing.tsx": component('    <button>{"Save"}</button>') });
    expect(findViolations(dir)).toHaveLength(1);
  });

  it("flags literal copy in a template-literal child even when it also interpolates", () => {
    const dir = makeFixture({
      "src/x/Thing.tsx": component("    <p>{`Total: ${locale}`}</p>"),
    });
    const violations = findViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Total");
  });

  it.each(["title", "placeholder", "alt", "aria-label"])(
    "flags a literal %s attribute — user-facing copy, not a hook for code",
    (attribute) => {
      const dir = makeFixture({
        "src/x/Thing.tsx": component(`    <input ${attribute}="Task name" />`),
      });
      const violations = findViolations(dir);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain(attribute);
    },
  );

  it("flags a literal user-facing attribute written as an expression", () => {
    const dir = makeFixture({ "src/x/Thing.tsx": component('    <input placeholder={"Task name"} />') });
    expect(findViolations(dir)).toHaveLength(1);
  });

  it("reports file and line so the violation is findable", () => {
    const dir = makeFixture({
      "src/x/Thing.tsx": component("    <div>\n      <span>Delete</span>\n    </div>"),
    });
    const violations = findViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^src\/x\/Thing\.tsx:6:/);
  });

  it("finds every violation in a file, not just the first", () => {
    const dir = makeFixture({
      "src/x/Thing.tsx": component('    <div title="Hello">\n      <span>World</span>\n    </div>'),
    });
    expect(findViolations(dir)).toHaveLength(2);
  });
});

describe("no-hardcoded-strings lint — what it must stay silent about", () => {
  it("passes a component whose every string comes from t()", () => {
    const dir = makeFixture({
      "src/x/Thing.tsx": component(
        '    <button aria-label={t(locale, "a.b")} className="thing" data-testid="thing">\n' +
          '      {t(locale, "a.c")}\n' +
          "    </button>",
      ),
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it.each([
    ["className", '<div className="settings__group" />'],
    ["data-testid", '<div data-testid="insights-week-bars" />'],
    ["role", '<p role="alert" />'],
    ["type", '<button type="button" />'],
    ["value", '<option value="custom" />'],
    ["id", '<input id="reminder" />'],
    ["name", '<input name="minutes" />'],
    ["href", '<a href="https://example.invalid" />'],
    ["aria-labelledby", '<div aria-labelledby="heading-id" />'],
    ["aria-describedby", '<div aria-describedby="note-id" />'],
    ["autoComplete", '<input autoComplete="off" />'],
  ])("does not flag %s — it addresses code, not a reader", (_name, jsx) => {
    const dir = makeFixture({ "src/x/Thing.tsx": component(`    ${jsx}`) });
    expect(findViolations(dir)).toEqual([]);
  });

  it("does not flag text with no letters — separators, sigils and digits are data, not copy", () => {
    const dir = makeFixture({
      "src/x/Thing.tsx": component(
        "    <div>\n      <span>@</span>\n      <span>#</span>\n      <span>—</span>\n      <span>%</span>\n    </div>",
      ),
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("does not flag a template literal that is pure interpolation", () => {
    const dir = makeFixture({
      "src/x/Thing.tsx": component("    <span>{`${locale}${locale}`}</span>"),
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("does not flag an HTML entity, whose name is not copy", () => {
    const dir = makeFixture({ "src/x/Thing.tsx": component("    <span>&nbsp;&mdash;</span>") });
    expect(findViolations(dir)).toEqual([]);
  });

  it("does not flag a JSX comment", () => {
    const dir = makeFixture({
      "src/x/Thing.tsx": component("    <div>\n      {/* Explains why this exists */}\n    </div>"),
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("skips test files, whose fixture copy is the point of the test", () => {
    const dir = makeFixture({ "src/x/Thing.test.tsx": component("    <button>Save</button>") });
    expect(findViolations(dir)).toEqual([]);
  });

  it("does not scan .ts files — there is no JSX in them to mis-read", () => {
    const dir = makeFixture({ "src/x/thing.ts": 'export const label = "Save";\n' });
    expect(findViolations(dir)).toEqual([]);
  });
});

describe("no-hardcoded-strings lint — against a REAL component, not a fixture", () => {
  function realComponentFixture(relPath: string, mutate: (text: string) => string): string {
    const dir = mkdtempSync(join(tmpdir(), "ttt-strings-real-"));
    fixtureDir = dir;
    const source = readFileSync(join(process.cwd(), relPath), "utf8");
    const target = join(dir, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, mutate(source), "utf8");
    return dir;
  }

  it("reports the real tree clean", () => {
    expect(findViolations(process.cwd())).toEqual([]);
  });

  it("fires when a real component's t() call is replaced by the English literal", () => {
    // Precisely the regression this gate exists to stop: someone in a hurry
    // types the string instead of adding a key, and every other check —
    // tsc, the component tests, the build — stays green.
    const dir = realComponentFixture("src/settings/Settings.tsx", (text) => {
      const replaced = text.replace('{t(locale, "settings.shortcuts.change")}', "Change");
      if (replaced === text) throw new Error("sabotage did not apply — the anchor text moved");
      return replaced;
    });
    const violations = findViolations(dir);
    expect(violations.some((v) => v.includes("Settings.tsx") && v.includes("Change"))).toBe(true);
  });

  it("fires when a real component's aria-label is replaced by a literal", () => {
    const dir = realComponentFixture("src/insights/Insights.tsx", (text) => {
      const replaced = text.replace(
        'aria-label={t(locale, "insights.sectionLabel")}',
        'aria-label="Insights"',
      );
      if (replaced === text) throw new Error("sabotage did not apply — the anchor text moved");
      return replaced;
    });
    const violations = findViolations(dir);
    expect(violations.some((v) => v.includes("Insights.tsx") && v.includes("aria-label"))).toBe(true);
  });
});
