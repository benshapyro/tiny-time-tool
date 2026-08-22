#!/usr/bin/env node
// i18n coverage gate (BUILD_SPEC S13a; CLAUDE.md non-negotiable #4 — "every
// UI string goes through the i18n layer, en + es both complete"). Fails
// (non-zero exit) if the Spanish catalog is incomplete in any sense that
// actually reaches a user.
//
// WHY THIS EXISTS, GIVEN WHAT ALREADY DID — `src/i18n/es.ts` is typed
// `Record<TranslationKey, string>`, so a MISSING key is already a `tsc`
// error, and `src/i18n/i18n.test.ts` already asserts key-set equality. If
// this script only re-checked that, it would be a third copy of a check that
// already passes — the F7 shape from verification.md, a check written in
// terms of the thing it checks. What the type system CANNOT see, because
// `Record<K, string>` is satisfied by any string at all:
//
//   1. an `es` value that is present but IDENTICAL to the `en` value — the
//      classic half-finished translation, English text sitting in the
//      Spanish catalog;
//   2. an `es` value that is present but EMPTY or whitespace-only — a key
//      that renders as a blank label;
//   3. a key that exists, is translated in both catalogs, and is rendered by
//      NOTHING. Coverage measured only over the catalogs reports 100% while
//      an entire surface goes untranslated. That was not hypothetical here:
//      the five `tray.*` keys were complete in both catalogs for twelve
//      slices while `src-tauri/src/tray.rs` hardcoded the English menu
//      labels and tooltips, because the native tray menu is built before the
//      webview's JS runtime exists and cannot call `t()`. S12 shipped the
//      language setting, which made that reachable: a Spanish app with an
//      English tray menu. S13a wires the labels through the
//      `set_tray_labels` command (`src/tray/trayLabels.ts` ->
//      `src-tauri/src/tray.rs`), and THIS half of the gate is what keeps any
//      future key from going the same way.
//
// Deny-by-default in both halves: identity is a violation unless the key is
// on `IDENTITY_ALLOWED` with a reason, and an unrendered key is a violation
// unless it is on `UNUSED_KEY_ALLOWED` with a reason. Nothing is excused by
// pattern.
//
// The catalogs are parsed with the TypeScript compiler API (already a
// devDependency, already on deps-allowlist.txt) rather than by regex, and
// key references are collected from the AST rather than by substring — so a
// key named only inside a comment does not count as rendered.
//
// Usage: node scripts/check-i18n-coverage.mjs [rootDir]

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const EN_CATALOG = join("src", "i18n", "en.ts");
export const ES_CATALOG = join("src", "i18n", "es.ts");

/**
 * Keys whose Spanish value is DELIBERATELY identical to the English one.
 * Every entry needs a reason. A key belongs here only when translating it
 * would be wrong, never when translating it is merely unfinished.
 */
export const IDENTITY_ALLOWED = new Map([
  ["app.name", "the product name is a proper noun — 'Tiny Time Tool' is not translated in either catalog"],
  ["key.ctrl", "the modifier key is labelled 'Ctrl' on Spanish keyboards too — it is the key's own name"],
  ["key.alt", "same — 'Alt' is engraved on the key, not a word being translated"],
  ["key.win", "same — the Windows key is 'Win' in both"],
  ["key.esc", "same — 'Esc' is the key's own name"],
  ["key.tab", "same — 'Tab' is the key's own name"],
  ["settings.language.es", "language options are listed in their own language, so 'Español' is correct in both"],
]);

/**
 * Keys that no production module renders, deliberately. Every entry needs a
 * reason, and "we haven't got to it yet" is not one — that is the exact gap
 * this half of the gate exists to surface.
 */
export const UNUSED_KEY_ALLOWED = new Map([
  [
    "app.name",
    "the product name reaches the OS through src-tauri/tauri.conf.json (`productName` and the per-window " +
      "`title` fields), never through React, so no component renders this key. It is kept as the one place " +
      "the spelling is written down for the catalogs, and is embedded verbatim in the tray.tooltip.* " +
      "strings. Flagged to Ben in the S13a report as a residual: render it or drop it.",
  ],
]);

/** Files that contain every key by definition and so cannot count as a
 *  surface that renders one — counting them would make the unused-key half
 *  incapable of ever failing. */
const CATALOG_FILES = new Set([EN_CATALOG, ES_CATALOG].map(toPosix));

function toPosix(p) {
  return p.split(sep).join("/");
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if (err && err.code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    out.push(full);
  }
  return out;
}

function parseSource(fileName, text) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
}

/** Unwraps `as const` / `satisfies` / parentheses around an initializer. */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Reads a catalog module's exported object literal into a Map of
 * key -> { value, line }. `value` is null when the entry is not a plain
 * string literal, which is itself reported as a violation: a computed or
 * concatenated catalog value is not something this gate can compare, and
 * silently skipping it would be a hole.
 */
export function parseCatalog(text, fileName) {
  const source = parseSource(fileName, text);
  const entries = new Map();

  const readObject = (objectLiteral) => {
    for (const property of objectLiteral.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = ts.isStringLiteral(property.name)
        ? property.name.text
        : ts.isIdentifier(property.name)
          ? property.name.text
          : null;
      if (key === null) continue;
      const initializer = property.initializer;
      const value =
        ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)
          ? initializer.text
          : null;
      const { line } = source.getLineAndCharacterOfPosition(property.getStart(source));
      entries.set(key, { value, line: line + 1 });
    }
  };

  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      const initializer = unwrap(node.initializer);
      if (initializer && ts.isObjectLiteralExpression(initializer)) readObject(initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return entries;
}

/** Every string literal appearing anywhere in a module's AST. Comments are
 *  not part of the AST, so a key merely mentioned in prose does not count. */
export function stringLiteralsIn(text, fileName) {
  const source = parseSource(fileName, text);
  const literals = new Set();
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
}

function readCatalogs(rootDir) {
  const en = parseCatalog(readFileSync(join(rootDir, EN_CATALOG), "utf8"), EN_CATALOG);
  const es = parseCatalog(readFileSync(join(rootDir, ES_CATALOG), "utf8"), ES_CATALOG);
  return { en, es };
}

/** Key parity, empty values, and untranslated (identical) values. */
export function findCatalogViolations(rootDir) {
  const violations = [];
  const { en, es } = readCatalogs(rootDir);

  for (const [key, enEntry] of en) {
    const esEntry = es.get(key);
    if (esEntry === undefined) {
      violations.push(`${toPosix(ES_CATALOG)}: "${key}" is missing — every en key needs an es value`);
      continue;
    }
    if (enEntry.value === null) {
      violations.push(
        `${toPosix(EN_CATALOG)}:${enEntry.line}: "${key}" is not a plain string literal — this gate cannot compare it`,
      );
      continue;
    }
    if (esEntry.value === null) {
      violations.push(
        `${toPosix(ES_CATALOG)}:${esEntry.line}: "${key}" is not a plain string literal — this gate cannot compare it`,
      );
      continue;
    }
    if (esEntry.value.trim() === "") {
      violations.push(`${toPosix(ES_CATALOG)}:${esEntry.line}: "${key}" has an empty es value`);
      continue;
    }
    if (esEntry.value === enEntry.value && !IDENTITY_ALLOWED.has(key)) {
      violations.push(
        `${toPosix(ES_CATALOG)}:${esEntry.line}: "${key}" is identical to the en value (${JSON.stringify(
          enEntry.value,
        )}) — untranslated, or add it to IDENTITY_ALLOWED with a reason`,
      );
    }
  }

  for (const [key, esEntry] of es) {
    if (!en.has(key)) {
      violations.push(
        `${toPosix(ES_CATALOG)}:${esEntry.line}: "${key}" has no en value — an orphaned translation`,
      );
    }
  }

  return violations;
}

/**
 * Keys nothing renders. Scans every production `.ts`/`.tsx` under `src/`
 * (test files excluded on purpose: a key asserted only by a test is still
 * shown to no user — that was precisely the tray keys' situation) and reports
 * any catalog key that appears as a string literal in none of them.
 */
export function findUnusedKeys(rootDir) {
  const violations = [];
  const { en } = readCatalogs(rootDir);

  const referenced = new Set();
  for (const file of walk(join(rootDir, "src"))) {
    if (!/\.tsx?$/.test(file)) continue;
    if (/\.test\.tsx?$/.test(file)) continue;
    const rel = toPosix(relative(rootDir, file));
    if (CATALOG_FILES.has(rel)) continue;
    for (const literal of stringLiteralsIn(readFileSync(file, "utf8"), file)) referenced.add(literal);
  }

  for (const [key, entry] of en) {
    if (referenced.has(key)) continue;
    if (UNUSED_KEY_ALLOWED.has(key)) continue;
    violations.push(
      `${toPosix(EN_CATALOG)}:${entry.line}: "${key}" is translated in both catalogs but rendered by no ` +
        `production module — a surface that shows English regardless of the language setting, or a dead key`,
    );
  }

  return violations;
}

export function findViolations(rootDir) {
  return [...findCatalogViolations(rootDir), ...findUnusedKeys(rootDir)];
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const violations = findViolations(rootDir);

  if (violations.length > 0) {
    console.error("i18n coverage check FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      `\n${violations.length} violation(s). Every UI string key needs a complete, distinct es value AND a` +
        ` surface that renders it (CLAUDE.md #4). Deliberate exceptions go in IDENTITY_ALLOWED /` +
        ` UNUSED_KEY_ALLOWED in this file, each with a reason.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("i18n coverage check passed: en and es are complete, distinct, and every key is rendered.");
  process.exitCode = 0;
}

// See check-zero-network.mjs for why the naive `file://` + argv[1] comparison
// silently disables a gate on Windows.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
