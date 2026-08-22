// Guards the design-review fix: a user must never see "CmdOrCtrl" — the
// first-launch teach line showed exactly that, in both languages.

import { describe, expect, it } from "vitest";
import { DEFAULT_ACCELERATORS } from "./shortcutController";
import { formatAccelerator } from "./formatAccelerator";

describe("formatAccelerator", () => {
  it("never leaks the Tauri token 'CmdOrCtrl' to a user, on either platform", () => {
    for (const platform of ["macos", "other"] as const) {
      for (const accel of Object.values(DEFAULT_ACCELERATORS)) {
        expect(formatAccelerator(accel, platform, "en").toLowerCase()).not.toContain("cmdorctrl");
      }
    }
  });

  it("renders the pinned primary shortcut as macOS glyphs", () => {
    expect(formatAccelerator(DEFAULT_ACCELERATORS.primary, "macos", "en")).toBe("⌘⇧Space");
  });

  it("renders the pinned primary shortcut in words elsewhere", () => {
    expect(formatAccelerator(DEFAULT_ACCELERATORS.primary, "other", "en")).toBe("Ctrl+Shift+Space");
  });

  it("renders the pinned stop shortcut on both platforms", () => {
    expect(formatAccelerator(DEFAULT_ACCELERATORS.stop, "macos", "en")).toBe("⌘⇧⌥Space");
    expect(formatAccelerator(DEFAULT_ACCELERATORS.stop, "other", "en")).toBe("Ctrl+Shift+Alt+Space");
  });

  it("uppercases a single-character key", () => {
    expect(formatAccelerator("CmdOrCtrl+k", "macos", "en")).toBe("⌘K");
  });

  it("passes unknown tokens through rather than dropping part of the shortcut", () => {
    // Silently hiding a key would misinform worse than showing something odd.
    expect(formatAccelerator("CmdOrCtrl+F13", "other", "en")).toBe("Ctrl+F13");
  });

  it("returns an empty string for an empty accelerator instead of throwing", () => {
    expect(formatAccelerator("", "macos", "en")).toBe("");
  });
});

// Review finding on S5: the non-macOS branch hardcoded English key names, so
// Windows/Linux in Spanish rendered "Pulsa Ctrl+Shift+Space para empezar a
// registrar" — English words inside a Spanish sentence, bypassing i18n.
describe("formatAccelerator — key names are localized, not hardcoded English", () => {
  it("renders Spanish key names on the non-macOS branch", () => {
    expect(formatAccelerator(DEFAULT_ACCELERATORS.primary, "other", "es")).toBe(
      "Ctrl+Mayús+Espacio",
    );
  });

  it("differs between en and es wherever the words differ", () => {
    const en = formatAccelerator(DEFAULT_ACCELERATORS.primary, "other", "en");
    const es = formatAccelerator(DEFAULT_ACCELERATORS.primary, "other", "es");
    expect(es).not.toBe(en);
  });

  it("keeps macOS MODIFIER glyphs locale-independent while still localizing the key name", () => {
    // ⌘ ⇧ ⌥ are symbols and identical everywhere; "Space" is a word and must
    // become "Espacio". Both halves of that matter — an earlier version of
    // this test asserted the whole string was locale-independent, which would
    // have locked in the very English-leak the fix removes.
    const es = formatAccelerator(DEFAULT_ACCELERATORS.stop, "macos", "es");
    const en = formatAccelerator(DEFAULT_ACCELERATORS.stop, "macos", "en");
    expect(en).toBe("⌘⇧⌥Space");
    expect(es).toBe("⌘⇧⌥Espacio");
    expect(es.startsWith("⌘⇧⌥")).toBe(true);
  });

  it("localizes the spelled-out key name too, not just the modifiers", () => {
    expect(formatAccelerator("CmdOrCtrl+Enter", "other", "es")).toContain("Intro");
  });
});
