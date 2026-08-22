import { describe, expect, it } from "vitest";
import { acceleratorFromKeyCombo } from "./acceleratorCapture";

function combo(overrides: Partial<Parameters<typeof acceleratorFromKeyCombo>[0]>) {
  return {
    key: "a",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("acceleratorFromKeyCombo", () => {
  it("matches the pinned primary default exactly: Cmd+Shift+Space -> CmdOrCtrl+Shift+Space", () => {
    expect(acceleratorFromKeyCombo(combo({ key: " ", metaKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+Space",
    );
  });

  it("matches the pinned stop default exactly: Cmd+Shift+Alt+Space -> CmdOrCtrl+Shift+Alt+Space", () => {
    expect(
      acceleratorFromKeyCombo(combo({ key: " ", metaKey: true, shiftKey: true, altKey: true })),
    ).toBe("CmdOrCtrl+Shift+Alt+Space");
  });

  it("a bare modifier alone is not a complete combination yet", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "Meta", metaKey: true }))).toBeNull();
    expect(acceleratorFromKeyCombo(combo({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("a non-modifier key with NO modifier held is rejected — every accelerator here needs at least one", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "a" }))).toBeNull();
  });

  it("letters are uppercased", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "p", ctrlKey: true }))).toBe("Ctrl+P");
  });

  it("digits pass through as-is", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "5", ctrlKey: true }))).toBe("Ctrl+5");
  });

  it("ctrlKey WITHOUT metaKey maps to the distinct 'Ctrl' token, not 'CmdOrCtrl'", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "p", ctrlKey: true }))).toBe("Ctrl+P");
  });

  it("metaKey takes precedence over ctrlKey when both are somehow held", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "p", metaKey: true, ctrlKey: true }))).toBe("CmdOrCtrl+P");
  });

  it("modifier token order is fixed regardless of which modifiers are present (Shift before Alt, matching DEFAULT_ACCELERATORS)", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "p", altKey: true, shiftKey: true, metaKey: true }))).toBe(
      "CmdOrCtrl+Shift+Alt+P",
    );
  });

  it("named keys render as their Tauri token, not their raw JS key value", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "Escape", ctrlKey: true }))).toBe("Ctrl+Escape");
    expect(acceleratorFromKeyCombo(combo({ key: "Enter", ctrlKey: true }))).toBe("Ctrl+Enter");
    expect(acceleratorFromKeyCombo(combo({ key: "ArrowUp", ctrlKey: true }))).toBe("Ctrl+Up");
  });

  it("function keys pass through as-is", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "F5", ctrlKey: true }))).toBe("Ctrl+F5");
  });

  it("a key this function doesn't recognize returns null rather than a bogus token", () => {
    expect(acceleratorFromKeyCombo(combo({ key: "Dead", ctrlKey: true }))).toBeNull();
  });
});
