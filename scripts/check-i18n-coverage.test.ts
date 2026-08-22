// Proves the i18n-coverage gate can see the things `tsc` and the runtime
// key-set test cannot.
//
// `es.ts` is typed `Record<TranslationKey, string>`, so a MISSING key is
// already a compile error and `src/i18n/i18n.test.ts` already asserts key-set
// equality. Re-testing that here would be theatre. The cases that matter are
// the ones the type system is blind to by construction:
//
//   - an `es` value that is present but IDENTICAL to `en` (an untranslated
//     placeholder — `Record<K, string>` is perfectly happy with it);
//   - an `es` value that is present but EMPTY (ditto);
//   - a key that exists in both catalogs and is rendered by NOTHING — the
//     `tray.*` surface was exactly this for twelve slices, fully translated
//     in both catalogs and hardcoded in English in `src-tauri/src/tray.rs`.
//
// The last block does not use hand-authored fixtures at all: it copies the
// REAL catalogs, breaks one value, and asserts the gate fires. A fixture that
// agrees with its author proves only that its author was consistent
// (verification.md F7/F11), so the gate is also pointed at the real tree.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findCatalogViolations, findUnusedKeys, findViolations } from "./check-i18n-coverage.mjs";

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

function makeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ttt-i18n-"));
  for (const [relPath, contents] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  fixtureDir = dir;
  return dir;
}

/** Builds a minimal catalog pair. Values are given as `[en, es]` pairs. */
function catalogs(entries: Record<string, [string, string]>): Record<string, string> {
  const enBody = Object.entries(entries)
    .map(([key, [enValue]]) => `  ${JSON.stringify(key)}: ${JSON.stringify(enValue)},`)
    .join("\n");
  const esBody = Object.entries(entries)
    .map(([key, [, esValue]]) => `  ${JSON.stringify(key)}: ${JSON.stringify(esValue)},`)
    .join("\n");
  return {
    "src/i18n/en.ts": `export const en = {\n${enBody}\n} as const;\n\nexport type TranslationKey = keyof typeof en;\n`,
    "src/i18n/es.ts": `import type { TranslationKey } from "./en";\n\nexport const es: Record<TranslationKey, string> = {\n${esBody}\n};\n`,
  };
}

/** A production module that "renders" the given keys, so the unused-key half
 *  of the gate sees them as reached. */
function consumer(keys: string[]): string {
  const calls = keys.map((key) => `  t(locale, ${JSON.stringify(key)});`).join("\n");
  return `import { t } from "../i18n";\n\nexport function render(locale: "en" | "es") {\n${calls}\n}\n`;
}

describe("i18n coverage gate — catalog completeness", () => {
  it("passes a catalog pair that is fully and distinctly translated", () => {
    const dir = makeFixture({
      ...catalogs({ "a.one": ["One", "Uno"], "a.two": ["Two", "Dos"] }),
      "src/feature/render.ts": consumer(["a.one", "a.two"]),
    });
    expect(findViolations(dir)).toEqual([]);
  });

  it("catches a key present in en and missing from es", () => {
    const dir = makeFixture({
      "src/i18n/en.ts": `export const en = {\n  "a.one": "One",\n  "a.two": "Two",\n} as const;\n`,
      "src/i18n/es.ts": `export const es = {\n  "a.one": "Uno",\n};\n`,
      "src/feature/render.ts": consumer(["a.one", "a.two"]),
    });
    const violations = findCatalogViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("a.two");
    expect(violations[0]).toMatch(/missing/i);
  });

  it("catches a key present in es and missing from en (an orphaned translation)", () => {
    const dir = makeFixture({
      "src/i18n/en.ts": `export const en = {\n  "a.one": "One",\n} as const;\n`,
      "src/i18n/es.ts": `export const es = {\n  "a.one": "Uno",\n  "a.ghost": "Fantasma",\n};\n`,
      "src/feature/render.ts": consumer(["a.one"]),
    });
    const violations = findCatalogViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("a.ghost");
  });

  // The two the type system cannot see. `Record<TranslationKey, string>` is
  // satisfied by "" and by a verbatim copy of the English.
  it("catches an EMPTY es value — present, typed, and useless", () => {
    const dir = makeFixture({
      ...catalogs({ "a.one": ["One", ""] }),
      "src/feature/render.ts": consumer(["a.one"]),
    });
    const violations = findCatalogViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("a.one");
    expect(violations[0]).toMatch(/empty/i);
  });

  it("catches a whitespace-only es value", () => {
    const dir = makeFixture({
      ...catalogs({ "a.one": ["One", "   "] }),
      "src/feature/render.ts": consumer(["a.one"]),
    });
    expect(findCatalogViolations(dir)).toHaveLength(1);
  });

  it("catches an es value identical to the en value — the untranslated placeholder", () => {
    const dir = makeFixture({
      ...catalogs({ "a.one": ["Start", "Start"] }),
      "src/feature/render.ts": consumer(["a.one"]),
    });
    const violations = findCatalogViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("a.one");
    expect(violations[0]).toMatch(/identical/i);
  });

  it("allows a deliberately identical value on an allowlisted key", () => {
    // "Ctrl" is "Ctrl" in Spanish. The allowlist is keyed by real catalog
    // keys, so this fixture uses one — which also pins that the gate
    // actually consults the allowlist rather than ignoring identity.
    const dir = makeFixture({
      ...catalogs({ "key.ctrl": ["Ctrl", "Ctrl"] }),
      "src/feature/render.ts": consumer(["key.ctrl"]),
    });
    expect(findCatalogViolations(dir)).toEqual([]);
  });

  it("still flags an allowlisted key whose es value is EMPTY — the allowlist covers identity only", () => {
    const dir = makeFixture({
      ...catalogs({ "key.ctrl": ["Ctrl", ""] }),
      "src/feature/render.ts": consumer(["key.ctrl"]),
    });
    expect(findCatalogViolations(dir)).toHaveLength(1);
  });
});

describe("i18n coverage gate — keys nothing renders", () => {
  it("flags a key that exists in both catalogs and is rendered by no production module", () => {
    const dir = makeFixture({
      ...catalogs({ "a.one": ["One", "Uno"], "a.orphan": ["Orphan", "Huérfano"] }),
      "src/feature/render.ts": consumer(["a.one"]),
    });
    const violations = findUnusedKeys(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("a.orphan");
  });

  it("does NOT count a reference from a test file as a surface", () => {
    // A key asserted only by a test is still shown to no user. This is the
    // shape the tray keys had: both catalogs complete, `i18n.test.ts`
    // asserting them, and the actual menu hardcoded in English in Rust.
    const dir = makeFixture({
      ...catalogs({ "a.one": ["One", "Uno"] }),
      "src/feature/render.test.ts": consumer(["a.one"]),
    });
    const violations = findUnusedKeys(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("a.one");
  });

  it("counts a reference from a .tsx component", () => {
    const dir = makeFixture({
      ...catalogs({ "a.one": ["One", "Uno"] }),
      "src/feature/Thing.tsx": `import { t } from "../i18n";\nexport const Thing = () => <p>{t("en", "a.one")}</p>;\n`,
    });
    expect(findUnusedKeys(dir)).toEqual([]);
  });

  it("does not count the catalogs themselves as a surface", () => {
    // en.ts and es.ts obviously contain every key. Counting them would make
    // this half of the gate incapable of ever failing — the F7 shape.
    const dir = makeFixture(catalogs({ "a.one": ["One", "Uno"] }));
    expect(findUnusedKeys(dir)).toHaveLength(1);
  });
});

describe("i18n coverage gate — against the REAL catalogs, not a self-authored fixture", () => {
  function realCatalogFixture(mutate?: (esText: string) => string): string {
    const dir = mkdtempSync(join(tmpdir(), "ttt-i18n-real-"));
    fixtureDir = dir;
    cpSync(join(process.cwd(), "src"), join(dir, "src"), { recursive: true });
    if (mutate) {
      const esPath = join(dir, "src", "i18n", "es.ts");
      writeFileSync(esPath, mutate(readFileSync(esPath, "utf8")), "utf8");
    }
    return dir;
  }

  it("reports the real tree clean", () => {
    expect(findViolations(process.cwd())).toEqual([]);
  });

  it("fires when a real es value is replaced by its English original", () => {
    // "Detener" is the Spanish for the popover's Stop action. Swapping it
    // back to "Stop" is exactly what a half-finished translation pass leaves
    // behind, and it is invisible to tsc and to the key-set test.
    const dir = realCatalogFixture((text) =>
      text.replace('"popover.action.stop": "Detener"', '"popover.action.stop": "Stop"'),
    );
    const violations = findViolations(dir);
    expect(violations.some((v) => v.includes("popover.action.stop") && /identical/i.test(v))).toBe(true);
  });

  it("fires when a real es value is emptied", () => {
    const dir = realCatalogFixture((text) =>
      text.replace('"log.entry.delete": "Eliminar"', '"log.entry.delete": ""'),
    );
    const violations = findViolations(dir);
    expect(violations.some((v) => v.includes("log.entry.delete") && /empty/i.test(v))).toBe(true);
  });

  it("fires when a real es key is deleted outright", () => {
    const dir = realCatalogFixture((text) => text.replace('  "away.prompt.keep": "Recuperar",\n', ""));
    const violations = findViolations(dir);
    expect(violations.some((v) => v.includes("away.prompt.keep") && /missing/i.test(v))).toBe(true);
  });
});
