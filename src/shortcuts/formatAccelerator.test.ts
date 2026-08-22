// Guards the design-review fix: a user must never see "CmdOrCtrl" — the
// first-launch teach line showed exactly that, in both languages.

import { describe, expect, it } from "vitest";
import { DEFAULT_ACCELERATORS } from "./shortcutController";
import { formatAccelerator } from "./formatAccelerator";

describe("formatAccelerator", () => {
  it("never leaks the Tauri token 'CmdOrCtrl' to a user, on either platform", () => {
    for (const platform of ["macos", "other"] as const) {
      for (const accel of Object.values(DEFAULT_ACCELERATORS)) {
        expect(formatAccelerator(accel, platform).toLowerCase()).not.toContain("cmdorctrl");
      }
    }
  });

  it("renders the pinned primary shortcut as macOS glyphs", () => {
    expect(formatAccelerator(DEFAULT_ACCELERATORS.primary, "macos")).toBe("⌘⇧Space");
  });

  it("renders the pinned primary shortcut in words elsewhere", () => {
    expect(formatAccelerator(DEFAULT_ACCELERATORS.primary, "other")).toBe("Ctrl+Shift+Space");
  });

  it("renders the pinned stop shortcut on both platforms", () => {
    expect(formatAccelerator(DEFAULT_ACCELERATORS.stop, "macos")).toBe("⌘⇧⌥Space");
    expect(formatAccelerator(DEFAULT_ACCELERATORS.stop, "other")).toBe("Ctrl+Shift+Alt+Space");
  });

  it("uppercases a single-character key", () => {
    expect(formatAccelerator("CmdOrCtrl+k", "macos")).toBe("⌘K");
  });

  it("passes unknown tokens through rather than dropping part of the shortcut", () => {
    // Silently hiding a key would misinform worse than showing something odd.
    expect(formatAccelerator("CmdOrCtrl+F13", "other")).toBe("Ctrl+F13");
  });

  it("returns an empty string for an empty accelerator instead of throwing", () => {
    expect(formatAccelerator("", "macos")).toBe("");
  });
});
