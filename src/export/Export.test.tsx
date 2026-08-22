// Component test for the S10 Dashboard Export section's presentational
// shell (BUILD_SPEC S10 row + Design principles: keyboard-first, tokens
// only, every state designed). Pure props in, no Tauri IPC — same pattern
// as `Log.test.tsx`. Covers: Copy-for-AI button fires its handler and
// renders the designed copied/error states; range inputs relay their
// values; CSV/JSON buttons fire; a range error renders as a real inline
// alert.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Export from "./Export";
import type { ExportState } from "./exportController";

function baseState(overrides: Partial<ExportState> = {}): ExportState {
  return {
    copyStatus: "idle",
    rangeStart: "2026-08-20",
    rangeEnd: "2026-08-21",
    rangeError: null,
    ...overrides,
  };
}

function renderExport(overrides: Partial<React.ComponentProps<typeof Export>> = {}) {
  const onCopyForAi = vi.fn();
  const onRangeStartChange = vi.fn();
  const onRangeEndChange = vi.fn();
  const onExportCsv = vi.fn();
  const onExportJson = vi.fn();
  const props: React.ComponentProps<typeof Export> = {
    locale: "en",
    state: baseState(),
    onCopyForAi,
    onRangeStartChange,
    onRangeEndChange,
    onExportCsv,
    onExportJson,
    ...overrides,
  };
  const result = render(<Export {...props} />);
  return { ...result, onCopyForAi, onRangeStartChange, onRangeEndChange, onExportCsv, onExportJson };
}

describe("Export — Dashboard section", () => {
  it("clicking Copy for AI fires onCopyForAi", () => {
    const { onCopyForAi } = renderExport();
    fireEvent.click(screen.getByRole("button", { name: "Copy today for AI" }));
    expect(onCopyForAi).toHaveBeenCalledTimes(1);
  });

  it("renders no status text when copyStatus is idle", () => {
    renderExport({ state: baseState({ copyStatus: "idle" }) });
    expect(screen.queryByText("Copied to clipboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't copy — try again")).not.toBeInTheDocument();
  });

  it("renders the designed success state when copyStatus is 'copied'", () => {
    renderExport({ state: baseState({ copyStatus: "copied" }) });
    expect(screen.getByRole("status")).toHaveTextContent("Copied to clipboard");
  });

  it("renders the designed error state (a real alert, not a silent no-op) when copyStatus is 'error'", () => {
    renderExport({ state: baseState({ copyStatus: "error" }) });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't copy — try again");
  });

  it("changing the start/end date inputs relays the new value", () => {
    const { onRangeStartChange, onRangeEndChange } = renderExport();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-08-01" } });
    expect(onRangeStartChange).toHaveBeenCalledWith("2026-08-01");
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-08-15" } });
    expect(onRangeEndChange).toHaveBeenCalledWith("2026-08-15");
  });

  it("clicking Export CSV / Export JSON fires their handlers", () => {
    const { onExportCsv, onExportJson } = renderExport();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(onExportCsv).toHaveBeenCalledTimes(1);
    expect(onExportJson).toHaveBeenCalledTimes(1);
  });

  it("a rangeError renders the designed inline error message", () => {
    renderExport({ state: baseState({ rangeError: "invalidOrder" }) });
    expect(screen.getByRole("alert")).toHaveTextContent("The start date must be on or before the end date.");
  });

  it("no rangeError renders no inline error", () => {
    renderExport({ state: baseState({ rangeError: null }) });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
