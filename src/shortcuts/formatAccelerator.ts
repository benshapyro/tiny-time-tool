// Renders a Tauri accelerator string the way a human reads it.
//
// WHY THIS EXISTS — a design-review finding on S5. The first-launch teach line
// is the very first thing a new user sees, and it read:
//
//     Pulsa CmdOrCtrl+Shift+Space para empezar a registrar
//
// `CmdOrCtrl` is a Tauri internal token, not a key anyone has on a keyboard.
// Shipping it undermines ST8 ("install-to-first-tracked-task under a minute
// without help") for exactly the non-technical teammates the pilot targets,
// and it is the kind of thing Design principle 9's award test exists to catch.
//
// BUILD_SPEC pins the teach line's *template* ("Press {primary shortcut} to
// start tracking") but not how the accelerator renders, so formatting it is
// spec-compliant rather than a spec change.
//
// Pure and platform-parameterised so it is testable without a real OS, and
// shared: S12's shortcut-rebind UI needs the same rendering.

export type AcceleratorPlatform = "macos" | "other";

/** macOS renders modifiers as glyphs with no separator — ⌘⇧Space. */
const MAC_TOKENS: Record<string, string> = {
  cmdorctrl: "⌘",
  commandorcontrol: "⌘",
  cmd: "⌘",
  command: "⌘",
  super: "⌘",
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

/** Windows and Linux spell them out, joined by "+" — Ctrl+Shift+Space. */
const OTHER_TOKENS: Record<string, string> = {
  cmdorctrl: "Ctrl",
  commandorcontrol: "Ctrl",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  super: "Win",
};

/** Key names that read better spelled out than as a bare token. */
const KEY_NAMES: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  return: "Enter",
  esc: "Esc",
  escape: "Esc",
  tab: "Tab",
};

function prettifyKey(token: string): string {
  const named = KEY_NAMES[token.toLowerCase()];
  if (named) return named;
  // Single characters read best uppercased; leave anything else as authored.
  return token.length === 1 ? token.toUpperCase() : token;
}

/**
 * Formats an accelerator such as `CmdOrCtrl+Shift+Space` for display.
 * macOS: `⌘⇧Space`. Elsewhere: `Ctrl+Shift+Space`.
 * Unknown tokens pass through unchanged rather than being dropped — showing
 * something odd beats silently hiding part of the user's shortcut.
 */
export function formatAccelerator(
  accelerator: string,
  platform: AcceleratorPlatform,
): string {
  const parts = accelerator.split("+").filter((p) => p.length > 0);
  if (parts.length === 0) return "";

  const table = platform === "macos" ? MAC_TOKENS : OTHER_TOKENS;
  const rendered = parts.map((part) => table[part.toLowerCase()] ?? prettifyKey(part));

  return platform === "macos" ? rendered.join("") : rendered.join("+");
}

/** The running platform, as this module cares about it. Kept separate so
 *  `formatAccelerator` stays pure and testable for both branches. */
export function currentAcceleratorPlatform(): AcceleratorPlatform {
  if (typeof navigator === "undefined") return "other";
  // `platform` is deprecated but still the most reliable signal available in
  // a webview without adding a dependency; userAgent is the fallback.
  const probe = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  return probe.includes("mac") ? "macos" : "other";
}
