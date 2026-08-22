// S12: applies the `theme` setting to the DOM. `src/styles/tokens.css`
// already wires two ways for dark values to take effect (its own doc
// comment, written at S1): `[data-theme="dark"]` for an explicit in-app
// choice, and `prefers-color-scheme: dark` for OS-sync absent one. This
// function is the ONE place that sets/clears the explicit attribute —
// "light"/"dark" set it, "system" removes it entirely so the existing
// `prefers-color-scheme` media query (already in tokens.css, untouched by
// this slice) takes back over.
//
// Pure DOM manipulation, no Tauri — testable against a plain jsdom element,
// which is exactly how `LiveSettingsProvider.tsx` (the one caller in every
// window, untested IPC-adjacent glue like every other *Container.tsx) uses
// it: real theme swapping, without needing a live window to prove it works.

import type { ThemeSetting } from "./themeSetting";

/** `root` defaults to `document.documentElement` — the real call site in
 * production — but accepts an explicit element so tests don't have to
 * mutate the shared jsdom document. */
export function applyTheme(theme: ThemeSetting, root: HTMLElement = document.documentElement): void {
  if (theme === "system") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", theme);
}
