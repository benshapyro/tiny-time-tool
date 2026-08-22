// S13b — the layout-resilience gate for the five named surfaces, with the
// Spanish catalog loaded (BUILD_SPEC S13b row; Design principle 7: "layouts
// tolerate 30% longer strings; the es experience is reviewed, not
// translated-and-hoped").
//
// ── WHY THIS IS NOT `expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth)`
//
// jsdom does not lay out. Both properties are `0` on every element, so that
// assertion is true for a correct surface, for an empty <div>, and for a
// surface that failed to render at all. verification.md records three
// slices (F1, F7, F11) that shipped behind a check which could not fail;
// this would have been the fourth, and the risk is not theoretical here —
// the FIRST draft of `surfaceFixtures.tsx` handed `insightsContent` to an
// `App` still sitting on its default Log tab, so Insights and Settings
// rendered empty tab panels. A real browser scan of those fixtures returned
// "no overflow" for both. It was found by looking at a screenshot.
//
// BUILD_SPEC permits "or equivalent clipped-text check". This file is that
// equivalent, in four parts, each of which can go red:
//
//   1. RENDERED — every surface, state and locale actually puts its own
//      root element on screen. This is what catches the vacuity above, and
//      everything below is worthless without it.
//   2. CLIPPING INVENTORY — deny-by-default over the shipped CSS. Every
//      rule that can clip text is classified; an unclassified one fails.
//      A future slice cannot add `text-overflow: ellipsis` to a translated
//      string without this test noticing.
//   3. ROW BUDGETS — the flex rows that cannot wrap or shrink, measured
//      with `textMetrics`' Chrome-calibrated upper bound against widths
//      derived from the real CSS at the real window widths. Lengthen a
//      Spanish button label and this goes red.
//   4. PANEL HEIGHT — `panelHeightFor` must cover the quick-entry panel's
//      real modelled content height. This is the assertion that was red
//      when the slice started: the shipped arithmetic under-budgeted the
//      switch notice and used the wrong gap token, and Spanish suggestion
//      text wrapped rows past their assumed height. Reproduce the browser
//      side with `layoutHarness.test.tsx` (see its header).
//
// Every width below is derived from `src/styles/tokens.css` and the
// component CSS in comments, and every one was cross-checked against the
// same element's real `clientWidth` in Chrome via the harness in
// `layoutHarness.test.tsx`. Numbers that are only asserted, never observed,
// are how a budget quietly stops describing the product.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { MAX_VISIBLE_SUGGESTIONS, panelHeightFor } from "../panel/panelHeight";
import { SURFACES, SURFACE_WIDTH, TAB_ORDER } from "./surfaceFixtures";
import { measureTextWidthUpperBound } from "./textMetrics";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

const LOCALES: Locale[] = ["es", "en"];

/** Token values this file reasons in, from `src/styles/tokens.css`. */
const SPACE_2 = 8;
const SPACE_3 = 12;
const SPACE_4 = 16;
const SPACE_5 = 24;
const BORDER_HAIRLINE = 1;
const FONT_SM = 12;
const FONT_BASE = 14;
const LINE_HEIGHT_BASE = 1.4;

/** A text line's box height at a given font size, rounded up — browsers
 *  round the used line-height up to a whole pixel. */
const lineBox = (fontSize: number) => Math.ceil(fontSize * LINE_HEIGHT_BASE);

/** Lines a string occupies in a box of `contentWidth`, modelled by greedy
 *  word wrapping — the same rule CSS `normal` white-space follows. A single
 *  word wider than the box still takes one line (it overflows instead). */
function wrappedLines(text: string, contentWidth: number, style: Parameters<typeof measureTextWidthUpperBound>[1]): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 1;
  let lines = 1;
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (measureTextWidthUpperBound(candidate, style) <= contentWidth) {
      current = candidate;
    } else {
      // Only close out a line if one was actually started. When the very
      // first word is itself wider than the box, `current` is still empty
      // and there is nothing to wrap away from — incrementing here would
      // count two lines for one oversized word, contradicting the docstring
      // above. Later oversized words are different: `current` is non-empty,
      // so the increment correctly closes the previous line.
      if (current !== "") lines += 1;
      current = word;
    }
  }
  return lines;
}

// ═══════════════════════════════════════════════════ 1. RENDERED

describe("S13b · every audited surface actually renders", () => {
  afterEach(cleanup);

  for (const surface of SURFACES) {
    for (const locale of LOCALES) {
      for (const variant of surface.variants) {
        it(`${surface.id}/${variant.id} renders its root in ${locale}`, () => {
          const { container } = render(variant.render(locale));
          if (surface.tab !== null) {
            const tabs = container.querySelectorAll('[role="tab"]');
            expect(tabs.length, "Dashboard tab bar missing").toBe(TAB_ORDER.length);
            fireEvent.click(tabs[TAB_ORDER.indexOf(surface.tab)]!);
          }
          const root = container.querySelector(surface.rootSelector);
          expect(root, `${surface.rootSelector} rendered nothing`).not.toBeNull();
          // Not just present — carrying words a reader would see. An empty
          // subtree overflows nothing and would pass every budget below.
          // Placeholders and accessible names count: the emptiest audited
          // state, the untyped quick-entry panel, legitimately shows only
          // an <input> whose visible copy is its placeholder.
          const visible = [
            root!.textContent ?? "",
            ...[...root!.querySelectorAll("[placeholder], [aria-label]")].map(
              (el) => `${el.getAttribute("placeholder") ?? ""} ${el.getAttribute("aria-label") ?? ""}`,
            ),
          ]
            .join(" ")
            .trim();
          expect(visible.length, `${surface.rootSelector} rendered no copy at all`).toBeGreaterThan(0);
        });
      }
    }
  }
});

// ═══════════════════════════════════════════ 2. CLIPPING INVENTORY

/**
 * Every rule in the shipped CSS that can clip text, and why it is allowed
 * to. Deny-by-default: a clipping declaration on a selector absent from
 * this table fails the test rather than being assumed benign.
 *
 *  - `user-data`      the text is a user-supplied entry name, client or
 *                     project. BUILD_SPEC puts no length limit on those, so
 *                     ellipsis IS the designed treatment and no translated
 *                     string is at risk.
 *  - `decorative`     clips a box that holds no text at all.
 *  - `visually-hidden` deliberately removed from the visual layout while
 *                     staying in the accessibility tree.
 *  - `scrolls`        content taller than the box scrolls; nothing is cut.
 */
const CLIPPING_ALLOWLIST: Record<string, "user-data" | "decorative" | "visually-hidden" | "scrolls"> = {
  ".popover__entryName": "user-data",
  ".log__entryName": "user-data",
  // "Se eliminó “{name}”." — the clipped tail is the user's entry name; the
  // translated prefix is short and always visible.
  ".log__undoMessage": "user-data",
  ".insights__tagName": "user-data",
  ".insights__taskName": "user-data",
  ".quick-entry__suggestion": "user-data",
  ".insights__barTrack": "decorative",
  ".settings__visuallyHidden": "visually-hidden",
  ".quick-entry__suggestions": "scrolls",
};

const COMPONENT_CSS = [
  join(SRC, "App.css"),
  join(SRC, "popover", "popover.css"),
  join(SRC, "panel", "quickEntryPanel.css"),
  join(SRC, "log", "log.css"),
  join(SRC, "export", "export.css"),
  join(SRC, "insights", "insights.css"),
  join(SRC, "settings", "settings.css"),
];

/** Declarations that make text truncation possible. `overflow: hidden` is
 *  included because it is what actually cut the suggestion list (F5). */
const CLIPPING_DECLARATION = /(text-overflow\s*:\s*ellipsis|white-space\s*:\s*nowrap|overflow(-x|-y)?\s*:\s*[^;]*hidden)/;

function clippingSelectors(): string[] {
  const found = new Set<string>();
  for (const file of COMPONENT_CSS) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = match;
      if (!CLIPPING_DECLARATION.test(body!)) continue;
      for (const part of selector!.split(",")) {
        const cleaned = part.trim().split(/[\s:>]/)[0]!;
        if (cleaned.startsWith(".")) found.add(cleaned);
      }
    }
  }
  return [...found].sort();
}

describe("S13b · clipping inventory is closed", () => {
  it("finds the clipping rules it is meant to be watching", () => {
    // Guards the parser itself: a regex that matched nothing would make the
    // deny-by-default check below vacuously green.
    const selectors = clippingSelectors();
    expect(selectors.length).toBeGreaterThanOrEqual(8);
    expect(selectors).toContain(".popover__entryName");
    expect(selectors).toContain(".quick-entry__suggestions");
  });

  it("classifies every clipping rule in the shipped CSS", () => {
    const unclassified = clippingSelectors().filter((s) => !(s in CLIPPING_ALLOWLIST));
    expect(
      unclassified,
      "a CSS rule can clip text and is not classified in CLIPPING_ALLOWLIST — " +
        "if it carries a translated string it needs a row budget below, not an entry here",
    ).toEqual([]);
  });

  it("does not carry stale entries for rules that no longer exist", () => {
    const live = new Set(clippingSelectors());
    const stale = Object.keys(CLIPPING_ALLOWLIST).filter((s) => !live.has(s));
    expect(stale, "allowlist entry for a rule that is no longer in the CSS").toEqual([]);
  });
});

// ═══════════════════════════════════════════════ 3. ROW BUDGETS

/**
 * A flex row whose items neither wrap nor shrink below their content: each
 * item's `min-width` resolves to `auto`, so if the translated labels are
 * wider than the row, the row overflows its window instead of adapting.
 * These are the only places in this app where a TRANSLATED string sits in a
 * hard-capped single-line box — everything else either wraps or is user
 * data (see CLIPPING_ALLOWLIST).
 */
interface RowBudget {
  name: string;
  /** Content width available to the row, in CSS px, derived in `note`. */
  available: number;
  /** Padding + border each item adds around its own text. */
  itemChrome: number;
  gap: number;
  style: Parameters<typeof measureTextWidthUpperBound>[1];
  labels: (locale: Locale) => string[];
  note: string;
}

const ROW_BUDGETS: RowBudget[] = [
  {
    name: "popover action row (3 buttons, running/paused)",
    // .popover padding var(--space-4) each side: 320 - 2*16 = 288.
    // Chrome cross-check: .popover__actions clientWidth = 288.
    available: SURFACE_WIDTH.popover - 2 * SPACE_4,
    // .popover__action padding var(--space-2) var(--space-3) + hairline border.
    itemChrome: 2 * SPACE_3 + 2 * BORDER_HAIRLINE,
    gap: SPACE_2,
    style: { size: FONT_BASE, weight: 500 },
    labels: (l) => [
      t(l, "popover.action.resume"),
      t(l, "popover.action.switch"),
      t(l, "popover.action.stop"),
    ],
    note: "320px popover, .popover__actions",
  },
  {
    name: "popover away-prompt actions (2 buttons)",
    // .popover content 288, minus .popover__away padding var(--space-3)
    // each side and its hairline border: 288 - 24 - 2 = 262.
    // Chrome cross-check: .popover__awayActions clientWidth = 262.
    available: SURFACE_WIDTH.popover - 2 * SPACE_4 - 2 * SPACE_3 - 2 * BORDER_HAIRLINE,
    itemChrome: 2 * SPACE_3 + 2 * BORDER_HAIRLINE,
    gap: SPACE_2,
    style: { size: FONT_BASE, weight: 500 },
    labels: (l) => [t(l, "away.prompt.keep"), t(l, "away.prompt.discard")],
    note: "320px popover, .popover__awayActions",
  },
  {
    name: "Dashboard tab bar at the narrowest main window",
    // .dashboard__tabs padding var(--space-3) var(--space-5) 0 — horizontal
    // padding is 24 each side: 480 - 48 = 432.
    available: SURFACE_WIDTH.dashboardMin - 2 * SPACE_5,
    // .dashboard__tab padding var(--space-2) var(--space-3); border: none
    // except a transparent bottom, which adds no width.
    itemChrome: 2 * SPACE_3,
    gap: SPACE_2,
    style: { size: FONT_BASE, weight: 500 },
    labels: (l) => [
      t(l, "dashboard.tab.log"),
      t(l, "dashboard.tab.insights"),
      t(l, "dashboard.tab.settings"),
    ],
    note: "480px Dashboard, .dashboard__tabs (display:flex, no wrap)",
  },
];

describe("S13b · non-shrinking rows fit their window", () => {
  for (const budget of ROW_BUDGETS) {
    for (const locale of LOCALES) {
      it(`${budget.name} fits in ${locale}`, () => {
        const labels = budget.labels(locale);
        const required =
          labels.reduce((sum, label) => sum + measureTextWidthUpperBound(label, budget.style) + budget.itemChrome, 0) +
          budget.gap * (labels.length - 1);
        expect(
          required,
          `${budget.note}: ${labels.join(" / ")} needs ${required.toFixed(1)}px of ${budget.available}px`,
        ).toBeLessThanOrEqual(budget.available);
      });
    }
  }
});

// ═══════════════════════════════════════════ 4. QUICK-ENTRY PANEL HEIGHT

/**
 * The quick-entry panel is the one window sized by arithmetic rather than
 * by the browser: `panelHeightFor` picks a height and `.quick-entry` fills
 * it, so an under-estimate slices content off the bottom — which is exactly
 * what F5 was. This models the real content height from the same tokens the
 * CSS uses and requires `panelHeightFor` to cover it.
 *
 * Every constant below was cross-checked against Chrome by rendering the
 * same fixtures through `layoutHarness.test.tsx` and reading the elements'
 * real box metrics; the measured values are quoted beside each one:
 *   notice   8+8 padding + 1+1 border + ceil(12*1.4)=17  -> 34.8 measured
 *   input    12+12 padding + 1+1 border + line box       -> 47.5 measured
 *   row      8+8 padding + ceil(14*1.4)=20               -> 36.6 measured
 *                                                   (35.6 for the first,
 *                                                    which has no border-top)
 */
const PANEL_CONTENT_WIDTH = SURFACE_WIDTH.quickEntry - 2 * SPACE_4; // 448
/** .quick-entry__notice: padding var(--space-2) var(--space-3) + border. */
const NOTICE_TEXT_WIDTH = PANEL_CONTENT_WIDTH - 2 * SPACE_3 - 2 * BORDER_HAIRLINE; // 422
// A suggestion row needs no text-width budget: `.quick-entry__suggestion`
// is `white-space: nowrap` (asserted below), so its height is one line
// whatever the string, and its horizontal overflow is the designed
// ellipsis on user data (CLIPPING_ALLOWLIST).
/** The 18px input's line box. Chrome renders 21.5px; rounded up. */
const INPUT_LINE_BOX = 22;

function modelledPanelHeight(input: { suggestions: string[]; notice: string | null }): number {
  let height = 2 * SPACE_4; // .quick-entry padding
  height += 2 * SPACE_3 + 2 * BORDER_HAIRLINE + INPUT_LINE_BOX; // the input
  if (input.notice !== null) {
    const lines = wrappedLines(input.notice, NOTICE_TEXT_WIDTH, { size: FONT_SM, weight: 400 });
    height += SPACE_3; // .quick-entry gap
    height += 2 * SPACE_2 + 2 * BORDER_HAIRLINE + lines * lineBox(FONT_SM);
  }
  const visible = Math.min(input.suggestions.length, MAX_VISIBLE_SUGGESTIONS);
  if (visible > 0) {
    height += SPACE_3; // .quick-entry gap
    height += 2 * BORDER_HAIRLINE; // .quick-entry__suggestions border
    for (let i = 0; i < visible; i += 1) {
      // Rows are single-line by construction — asserted separately below.
      height += 2 * SPACE_2 + lineBox(FONT_BASE) + (i === 0 ? 0 : BORDER_HAIRLINE);
    }
  }
  return height;
}

/** The audited panel states, taken from the same fixture list the harness
 *  and the screenshot review use. */
const PANEL_STATES = (locale: Locale) => [
  { label: "empty", suggestions: [] as string[], notice: null as string | null },
  {
    label: "switch notice + 3 suggestions",
    suggestions: [
      "Revisión del contrato de mantenimiento @Ayuntamiento #renovación",
      "Reunión de planificación trimestral #planificación",
      "Migración de la base de datos @Distribuidora",
    ],
    notice: t(locale, "panel.switchNotice")
      .replace("{name}", "Migración de la base de datos")
      .replace("{elapsed}", "22m"),
  },
  {
    label: "switch notice + a full list",
    suggestions: Array.from({ length: MAX_VISIBLE_SUGGESTIONS }, (_, i) => `Tarea de ejemplo número ${i + 1}`),
    notice: t(locale, "panel.switchNotice")
      .replace("{name}", "Migración de la base de datos")
      .replace("{elapsed}", "22m"),
  },
];

describe("S13b · the quick-entry panel is tall enough for its content", () => {
  it("keeps suggestion rows to a single line, which the height model assumes", () => {
    const css = readFileSync(join(SRC, "panel", "quickEntryPanel.css"), "utf8");
    const rule = css.match(/\.quick-entry__suggestion\s*\{([^}]*)\}/);
    expect(rule, ".quick-entry__suggestion rule not found").not.toBeNull();
    // Without this, a long Spanish suggestion wraps and the row is taller
    // than any fixed-row model can predict — the defect this slice found.
    expect(rule![1]).toMatch(/white-space\s*:\s*nowrap/);
    expect(rule![1]).toMatch(/text-overflow\s*:\s*ellipsis/);
  });

  it("lets the list scroll rather than slice a row if the model is ever short", () => {
    const css = readFileSync(join(SRC, "panel", "quickEntryPanel.css"), "utf8");
    const rule = css.match(/\.quick-entry__suggestions\s*\{([^}]*)\}/);
    expect(rule, ".quick-entry__suggestions rule not found").not.toBeNull();
    expect(rule![1]).toMatch(/overflow\s*:\s*[^;]*auto/);
  });

  for (const locale of LOCALES) {
    for (const state of PANEL_STATES(locale)) {
      it(`${state.label} fits the window it is given (${locale})`, () => {
        const modelled = modelledPanelHeight(state);
        const budgeted = panelHeightFor({
          suggestionCount: state.suggestions.length,
          hasNotice: state.notice !== null,
        });
        expect(
          budgeted,
          `panelHeightFor gives ${budgeted}px; the content needs ${modelled}px`,
        ).toBeGreaterThanOrEqual(modelled);
      });
    }
  }
});

// Review finding on S13b: `wrappedLines` contradicted its own docstring when
// the oversized word was the FIRST one. With `current` still empty there is
// no line to close out, but the else-branch incremented anyway — two lines
// counted for one word. Unreachable via the real callers and over-counting
// (the safe direction for a height budget), which is exactly why it needed a
// test rather than a note.
describe("wrappedLines — an oversized word in the leading position", () => {
  const style = { size: 14, weight: 400 } as const;

  it("a single word wider than the box still takes one line", () => {
    // Narrow enough that the first word cannot possibly fit.
    expect(wrappedLines("Incorporación", 10, style)).toBe(1);
  });

  it("counts the same whether the oversized word leads or follows", () => {
    const leading = wrappedLines("Incorporación x", 10, style);
    const following = wrappedLines("x Incorporación", 10, style);
    expect(leading).toBe(following);
  });

  it("still counts real wrapping correctly", () => {
    // A width that fits one short word per line.
    const lines = wrappedLines("uno dos tres", 30, style);
    expect(lines).toBeGreaterThan(1);
  });
});
