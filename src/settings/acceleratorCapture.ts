// S12: turns a captured DOM key combination into a Tauri accelerator string
// (e.g. "CmdOrCtrl+Shift+P") — the rebind UI's "press a key combination"
// flow. Pure function, no DOM event type dependency (a plain shape any
// `KeyboardEvent` satisfies), so it's unit-testable without simulating a
// real key event and reusable exactly as-is from `Settings.tsx`'s
// `onKeyDown` handler.
//
// Deliberately conservative: returns `null` for anything that isn't yet a
// COMPLETE, unambiguous combination (a bare modifier, or a non-modifier key
// with no modifier held at all — every real accelerator in this app,
// including both pinned defaults, carries at least one). A caller sees
// `null` as "keep listening", not as an error.

export interface KeyCombo {
  /** `KeyboardEvent.key` — e.g. "a", " ", "Escape", "F5". */
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** `KeyboardEvent.key` values for the modifier keys themselves — pressing
 * only these is "still choosing," not a complete combination yet. */
const BARE_MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift", "OS", "AltGraph"]);

/** Keys that read better as a named token than as their raw `key` value —
 * mirrors the vocabulary `formatAccelerator.ts` already knows how to
 * render back to a human (Space/Enter/Tab/Esc), plus arrows, which that
 * module doesn't need but a rebind flow does. */
const NAMED_KEYS: Record<string, string> = {
  " ": "Space",
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;
const ALPHANUMERIC = /^[a-zA-Z0-9]$/;

/**
 * Builds a Tauri accelerator string from a captured combo, or `null` if the
 * combo isn't complete yet (bare modifier) or the key has no accelerator
 * representation this function knows. Modifier order is fixed
 * (CmdOrCtrl/Ctrl, Shift, Alt) so the same physical combo always produces
 * the same string, matching `DEFAULT_ACCELERATORS`' own literal order —
 * "CmdOrCtrl+Shift+Space" and "CmdOrCtrl+Shift+Alt+Space" both put Shift
 * before Alt.
 *
 * `metaKey` (Cmd on macOS, the Windows key elsewhere) maps to "CmdOrCtrl" —
 * the same cross-platform token the app's own pinned defaults use.
 * `ctrlKey` held WITHOUT `metaKey` maps to the distinct "Ctrl" token (a
 * physical Ctrl press on macOS is not the same accelerator as Cmd, and
 * Tauri's accelerator vocabulary keeps them separate).
 */
export function acceleratorFromKeyCombo(combo: KeyCombo): string | null {
  if (BARE_MODIFIER_KEYS.has(combo.key)) return null;
  if (!combo.metaKey && !combo.ctrlKey && !combo.altKey && !combo.shiftKey) return null;

  const tokens: string[] = [];
  if (combo.metaKey) tokens.push("CmdOrCtrl");
  else if (combo.ctrlKey) tokens.push("Ctrl");
  if (combo.shiftKey) tokens.push("Shift");
  if (combo.altKey) tokens.push("Alt");

  const named = NAMED_KEYS[combo.key];
  let keyToken: string;
  if (named) {
    keyToken = named;
  } else if (ALPHANUMERIC.test(combo.key)) {
    keyToken = combo.key.toUpperCase();
  } else if (FUNCTION_KEY.test(combo.key)) {
    keyToken = combo.key;
  } else {
    return null; // unsupported key — show no combo rather than a bogus token
  }

  tokens.push(keyToken);
  return tokens.join("+");
}
