#!/usr/bin/env node
// No-hardcoded-strings lint (BUILD_SPEC S13a; CLAUDE.md non-negotiable #4 —
// "every UI string goes through the i18n layer ... no hardcoded user-visible
// text"). Fails (non-zero exit) if any production `.tsx` component renders
// literal text that did not come from `t(...)`.
//
// THE RULES, stated rather than implied — the whole risk in a lint like this
// is that it is either so loose it flags `className` (and gets suppressed
// within a week, guarding nothing thereafter) or so tight it flags nothing.
// It is parsed with the TypeScript compiler API, never by regex, so "is this
// a JSX child or an attribute value" is answered by the grammar.
//
// SCANNED: `src/**/*.tsx`, excluding `*.test.tsx`. Not `.ts` — no JSX there
// to misread, and controller-level copy is a different problem from this
// one. Test files render fixture copy on purpose; that IS the test.
//
// REPORTED — exactly three shapes, and nothing else:
//   1. A JSX text child containing at least one letter (`<button>Save</button>`).
//   2. A JSX child expression that is a string literal or a template
//      literal whose LITERAL SPANS contain a letter — so `{"Save"}` and
//      {`Total: ${x}`} are both caught, while {`${prefix}${tag}`} (pure
//      interpolation of data) is not.
//   3. The value of a USER-FACING attribute, when that value is a string
//      literal or a letter-bearing template: `title`, `placeholder`, `alt`,
//      `aria-label`, `aria-description`, `aria-placeholder`,
//      `aria-roledescription`, `aria-valuetext`, `label`. These are the
//      attributes a person reads or hears.
//
// NOT REPORTED, deliberately — this is the deny-by-default half, and it runs
// the other way round from the usual: the set of things that COUNT AS TEXT is
// the explicit allowlist (`USER_FACING_ATTRIBUTES` below), and every other
// attribute is refused by absence. `className`, `data-testid`, `id`,
// `htmlFor`, `role`, `type`, `value`, `name`, `href`, `src`, `key`, `style`,
// `aria-labelledby`/`aria-describedby` (which carry element IDs, not words)
// and every event handler address code, not a reader. Text with no letters
// is not copy either: `@`, `#`, `—`, `%` and digits are data or punctuation,
// and the Insights tag lists render exactly those as literals on purpose.
// HTML entities are stripped before the letter test, so `&nbsp;` is not read
// as the word "nbsp".
//
// A KNOWN LIMIT, stated rather than hidden: this gate sees `.tsx` only. The
// native tray menu is built in Rust and cannot call `t()` at all; its labels
// are pushed over the `set_tray_labels` command from
// `src/tray/trayLabels.ts`, and the guarantee that they are translated comes
// from `check-i18n-coverage.mjs`'s unused-key half plus
// `src/tray/trayLabels.test.ts`, not from here.
//
// Usage: node scripts/check-no-hardcoded-strings.mjs [rootDir]

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/** Attributes whose value a person reads or hears. Anything not on this list
 *  is treated as addressing code, not a reader — add to it only for a real
 *  text-bearing attribute. */
export const USER_FACING_ATTRIBUTES = new Set([
  "title",
  "placeholder",
  "alt",
  "label",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

/** `&nbsp;` / `&#8212;` — entity names are markup, not words. */
const HTML_ENTITY = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** True when the text carries an actual word, once entities are removed. */
export function carriesCopy(text) {
  return /\p{L}/u.test(text.replace(HTML_ENTITY, " "));
}

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

/** The literal spans of a template literal — everything outside `${...}`. */
function templateSpans(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
}

/** The copy carried by an expression, or null if it carries none. Only
 *  literals qualify — a `t(...)` call, an identifier, or any other
 *  expression is by construction not a hardcoded string. */
function literalCopy(expression) {
  if (ts.isStringLiteral(expression)) {
    return carriesCopy(expression.text) ? expression.text : null;
  }
  if (ts.isTemplateExpression(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    const spans = templateSpans(expression);
    const copy = spans.filter((span) => carriesCopy(span)).join(" ").trim();
    return copy === "" ? null : copy;
  }
  return null;
}

function condense(text) {
  return text.trim().replace(/\s+/g, " ");
}

export function findViolationsInSource(relPath, text) {
  const violations = [];
  const source = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const report = (node, message) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push(`${relPath}:${line + 1}: ${message}`);
  };

  const visitChildren = (children) => {
    for (const child of children) {
      if (ts.isJsxText(child)) {
        if (carriesCopy(child.text)) {
          report(child, `hardcoded text "${condense(child.text)}" — use t(locale, "…")`);
        }
        continue;
      }
      if (ts.isJsxExpression(child) && child.expression) {
        const copy = literalCopy(child.expression);
        if (copy !== null) {
          report(child, `hardcoded text "${condense(copy)}" — use t(locale, "…")`);
        }
      }
    }
  };

  const visitAttributes = (attributes) => {
    for (const attribute of attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) continue;
      const name = attribute.name.getText(source);
      if (!USER_FACING_ATTRIBUTES.has(name)) continue;
      const initializer = attribute.initializer;
      if (!initializer) continue;
      const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer;
      if (!expression) continue;
      const copy = literalCopy(expression);
      if (copy !== null) {
        report(attribute, `hardcoded ${name}="${condense(copy)}" — use t(locale, "…")`);
      }
    }
  };

  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      visitAttributes(node.openingElement.attributes);
      visitChildren(node.children);
    } else if (ts.isJsxSelfClosingElement(node)) {
      visitAttributes(node.attributes);
    } else if (ts.isJsxFragment(node)) {
      visitChildren(node.children);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return violations;
}

export function findViolations(rootDir) {
  const violations = [];
  for (const file of walk(join(rootDir, "src"))) {
    if (!file.endsWith(".tsx")) continue;
    if (file.endsWith(".test.tsx")) continue;
    const rel = toPosix(relative(rootDir, file));
    violations.push(...findViolationsInSource(rel, readFileSync(file, "utf8")));
  }
  return violations;
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const violations = findViolations(rootDir);

  if (violations.length > 0) {
    console.error("No-hardcoded-strings check FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      `\n${violations.length} violation(s). Every user-visible string must come from the i18n layer` +
        ` (CLAUDE.md #4) — add a key to src/i18n/en.ts and src/i18n/es.ts and render it with t(locale, key).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("No-hardcoded-strings check passed: every user-visible string in src/**/*.tsx comes from t().");
  process.exitCode = 0;
}

// See check-zero-network.mjs for why the naive `file://` + argv[1] comparison
// silently disables a gate on Windows.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
