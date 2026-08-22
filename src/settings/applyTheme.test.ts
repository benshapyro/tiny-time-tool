import { describe, expect, it } from "vitest";
import { applyTheme } from "./applyTheme";

function freshRoot(): HTMLElement {
  return document.createElement("html");
}

describe("applyTheme", () => {
  it("'light' sets data-theme=\"light\"", () => {
    const root = freshRoot();
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("'dark' sets data-theme=\"dark\"", () => {
    const root = freshRoot();
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("'system' removes the attribute entirely, so tokens.css's prefers-color-scheme query takes over", () => {
    const root = freshRoot();
    root.setAttribute("data-theme", "dark");
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("'system' is a genuine no-op on a root that never had the attribute (doesn't throw, doesn't add it)", () => {
    const root = freshRoot();
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("switching from dark to light overwrites rather than stacking attribute values", () => {
    const root = freshRoot();
    applyTheme("dark", root);
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("defaults to document.documentElement when no root is given", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
