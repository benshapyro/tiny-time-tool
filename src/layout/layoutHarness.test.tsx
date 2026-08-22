// S13b — screenshot-harness generator.
//
// WHY THIS EXISTS. jsdom does not lay out: `scrollWidth` and `clientWidth`
// are both `0` for every element, so the literal form of S13b's acceptance
// ("no element where scrollWidth > clientWidth") is unconditionally TRUE in
// this test environment — true for a correct surface, an empty div, and a
// catastrophically broken one alike. verification.md records three separate
// slices (F1, F7, F11) shipped behind a check that could not fail. Writing
// that assertion here would be a fourth.
//
// So this file does not assert layout. It EXPORTS the surfaces to a real
// layout engine: it renders each surface × state × width × theme × locale
// from `surfaceFixtures.tsx` into standalone HTML with the real token and
// component CSS inlined, sized to the real shipped window box, for a
// browser to lay out, measure (`scrollWidth > clientWidth` for real) and
// screenshot. The measuring script it embeds is the same one the agent
// screenshot review runs.
//
// It only writes files when `S13B_HARNESS_OUT` names a directory, so a
// normal `npm test` run has no side effects. The one assertion that always
// runs is a real one: every surface in the shared list renders without
// throwing, in both locales, at every width — which is the thing that would
// otherwise make an empty-DOM overflow check silently vacuous.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Locale } from "../i18n";
import { SURFACES, TAB_ORDER } from "./surfaceFixtures";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

const CSS_FILES = [
  join(SRC, "styles", "tokens.css"),
  join(SRC, "App.css"),
  join(SRC, "popover", "popover.css"),
  join(SRC, "panel", "quickEntryPanel.css"),
  join(SRC, "log", "log.css"),
  join(SRC, "export", "export.css"),
  join(SRC, "insights", "insights.css"),
  join(SRC, "settings", "settings.css"),
];

const LOCALES: Locale[] = ["es", "en"];
const THEMES = ["light", "dark"] as const;

/** Chrome-side measurement, embedded in every generated page. Reports every
 * element whose content is wider (or taller) than its box — the literal
 * S13b rule, run where a layout engine exists to make it meaningful. */
const MEASURE_SCRIPT = `
window.__measureOverflow = function () {
  const findings = [];
  for (const frame of document.querySelectorAll("[data-window]")) {
    const label = frame.getAttribute("data-window");
    for (const el of [frame, ...frame.querySelectorAll("*")]) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const overflowX = el.scrollWidth - el.clientWidth;
      const overflowY = el.scrollHeight - el.clientHeight;
      // Ignore elements that are deliberately scrollable (none today) and
      // sub-pixel rounding: only report a whole pixel or more.
      if (overflowX >= 1 || overflowY >= 1) {
        findings.push({
          window: label,
          selector: el === frame ? "[window]" : el.className || el.tagName.toLowerCase(),
          tag: el.tagName.toLowerCase(),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overflowX,
          overflowY,
          text: (el.textContent || "").trim().slice(0, 80),
        });
      }
    }
  }
  return findings;
};
window.__measureBoxes = function () {
  const boxes = [];
  for (const frame of document.querySelectorAll("[data-window]")) {
    const label = frame.getAttribute("data-window");
    for (const el of frame.querySelectorAll("*")) {
      if (!el.className || typeof el.className !== "string") continue;
      boxes.push({
        window: label,
        className: el.className,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        text: (el.textContent || "").trim().slice(0, 60),
      });
    }
  }
  return boxes;
};
`;

function page(theme: string, sections: string, css: string): string {
  return `<!doctype html>
<html lang="es" data-theme="${theme}">
<head>
<meta charset="utf-8">
<title>S13b harness</title>
<style>
${css}
html, body { margin: 0; padding: 0; }
body { background: var(--color-surface); padding: 24px; }
.harness__label {
  font: 600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-text-secondary);
  margin: 24px 0 6px;
}
.harness__window {
  /* The shipped window box. \`overflow: hidden\` is what a real webview
     does to content wider than its viewport, so clipping is visible here
     exactly as a user would see it. */
  overflow: hidden;
  box-sizing: border-box;
  outline: 1px dashed rgba(128,128,128,0.6);
  outline-offset: 2px;
}
</style>
</head>
<body>
${sections}
<script>${MEASURE_SCRIPT}</script>
</body>
</html>
`;
}

describe("S13b layout harness", () => {
  afterEach(cleanup);

  const css = CSS_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
  const outDir = process.env.S13B_HARNESS_OUT ?? null;

  // Grouped by surface + theme so the review reads one page per surface.
  const pages = new Map<string, string[]>();

  it("renders every surface, state, width and locale without throwing", () => {
    let rendered = 0;
    for (const surface of SURFACES) {
      for (const locale of LOCALES) {
        for (const width of surface.widths) {
          for (const variant of surface.variants) {
            const { container } = render(variant.render(locale));
            if (surface.tab !== null) {
              // `App` owns `activeTab` as local state and defaults to Log,
              // so a Dashboard surface is not on screen until its real tab
              // button is clicked. Skipping this is how the first draft of
              // this harness screenshotted an empty panel for Insights and
              // Settings while a browser overflow scan called them clean.
              const tabs = container.querySelectorAll('[role="tab"]');
              fireEvent.click(tabs[TAB_ORDER.indexOf(surface.tab)]!);
            }
            // The vacuity guard: a surface that rendered nothing would make
            // any downstream overflow check trivially pass, which is the
            // exact failure this slice exists to avoid.
            expect(
              container.querySelector(surface.rootSelector),
              `${surface.id}/${variant.id} (${locale}): ${surface.rootSelector} rendered nothing`,
            ).not.toBeNull();
            // React sets a controlled <select>/<input>'s value as a DOM
            // PROPERTY, not an attribute, so `innerHTML` serialises the
            // element with no `selected`/`value`/`checked` at all and the
            // browser falls back to the first option. The screenshots then
            // show the wrong language, the wrong reminder preset and an
            // unchecked autostart box — a review instrument quietly lying
            // about the product. Reflect the live state into attributes
            // before serialising.
            for (const select of container.querySelectorAll("select")) {
              for (const option of select.options) {
                if (option.value === select.value) option.setAttribute("selected", "");
                else option.removeAttribute("selected");
              }
            }
            for (const input of container.querySelectorAll("input")) {
              if (input.type === "checkbox" || input.type === "radio") {
                if (input.checked) input.setAttribute("checked", "");
                else input.removeAttribute("checked");
              } else {
                input.setAttribute("value", input.value);
              }
            }
            const label = `${surface.id}/${variant.id}/${width}px/${locale}`;
            const section =
              `<p class="harness__label">${label}</p>\n` +
              `<div class="harness__window" data-window="${label}" ` +
              `style="width:${width}px;height:${variant.height}px">` +
              `${container.innerHTML}</div>`;
            for (const theme of THEMES) {
              const key = `${surface.id}-${locale}-${theme}`;
              const list = pages.get(key) ?? [];
              list.push(section);
              pages.set(key, list);
            }
            cleanup();
            rendered += 1;
          }
        }
      }
    }
    expect(rendered).toBe(
      SURFACES.reduce((n, s) => n + s.widths.length * s.variants.length * LOCALES.length, 0),
    );

    if (outDir === null) return;
    mkdirSync(outDir, { recursive: true });
    for (const [key, sections] of pages) {
      const theme = key.endsWith("-dark") ? "dark" : "light";
      writeFileSync(join(outDir, `${key}.html`), page(theme, sections.join("\n"), css), "utf8");
    }
  });
});
