// Component test for the S4 quick-entry panel's presentational shell
// (BUILD_SPEC "Autonomous design review" UI-slice requirement + Design
// principles: keyboard-first, tokens only, both languages first-class).
// Pure props in, no Tauri IPC here — the live wiring
// (`QuickEntryPanelContainer.tsx`) is exercised at the S14 manual-check
// gate, same pattern as `tauriShortcutDriver.ts`/`tauriSqlDriver.ts`.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuickEntryPanel from "./QuickEntryPanel";

function renderPanel(overrides: Partial<React.ComponentProps<typeof QuickEntryPanel>> = {}) {
  const onTextChange = vi.fn();
  const onCommit = vi.fn();
  const props: React.ComponentProps<typeof QuickEntryPanel> = {
    locale: "en",
    mode: "naming",
    text: "",
    suggestions: [],
    notice: null,
    onTextChange,
    onCommit,
    ...overrides,
  };
  render(<QuickEntryPanel {...props} />);
  return { onTextChange, onCommit };
}

describe("QuickEntryPanel — i18n", () => {
  it("renders the input's aria-label and placeholder through i18n in en", () => {
    renderPanel({ locale: "en" });
    const input = screen.getByLabelText("Quick entry");
    expect(input).toHaveAttribute("placeholder", "Task name, @client, #project");
  });

  it("renders the distinct es literals for the same keys", () => {
    renderPanel({ locale: "es" });
    const input = screen.getByLabelText("Entrada rápida");
    expect(input).toHaveAttribute("placeholder", "Nombre de la tarea, @cliente, #proyecto");
  });
});

describe("QuickEntryPanel — notice (switch mode)", () => {
  it("renders the passive notice when provided", () => {
    renderPanel({ mode: "switching", notice: "Will stop: Acme onboarding (5:00)" });
    expect(screen.getByText("Will stop: Acme onboarding (5:00)")).toBeInTheDocument();
  });

  it("renders no notice element when notice is null (naming mode)", () => {
    renderPanel({ mode: "naming", notice: null });
    expect(screen.queryByText(/will stop/i)).not.toBeInTheDocument();
  });
});

describe("QuickEntryPanel — autocomplete suggestions", () => {
  it("renders each suggestion when the list is non-empty", () => {
    renderPanel({ suggestions: ["Acme onboarding", "Acme deep-dive"] });
    expect(screen.getByText("Acme onboarding")).toBeInTheDocument();
    expect(screen.getByText("Acme deep-dive")).toBeInTheDocument();
  });

  it("renders no suggestions list when empty", () => {
    renderPanel({ suggestions: [] });
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("QuickEntryPanel — keyboard interaction", () => {
  it("calls onTextChange as the user types", () => {
    const { onTextChange } = renderPanel();
    const input = screen.getByLabelText("Quick entry");
    fireEvent.change(input, { target: { value: "Acme onboarding" } });
    expect(onTextChange).toHaveBeenCalledWith("Acme onboarding");
  });

  it("calls onCommit on Enter", () => {
    const { onCommit } = renderPanel();
    const input = screen.getByLabelText("Quick entry");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("does not call onCommit on any other key", () => {
    const { onCommit } = renderPanel();
    const input = screen.getByLabelText("Quick entry");
    fireEvent.keyDown(input, { key: "a" });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("the input is keyboard-reachable and auto-focused (BUILD_SPEC S4 spike: keystrokes must land immediately, no click required)", () => {
    renderPanel();
    const input = screen.getByLabelText("Quick entry");
    expect(input).toHaveFocus();
  });
});
