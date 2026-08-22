// S7: component tests for editing in the Log tab's presentational shell
// (BUILD_SPEC S7 row + Design principles: keyboard-first, tokens only, both
// languages first-class, every state is designed — including the inline
// overlap error and the undo toast, which are their own designed states,
// not thrown exceptions or bare strings). Split from Log.test.tsx (S6) for
// the same reason the other S7 test files are split from their S6/S2
// counterparts. Pure props in, no Tauri IPC — same pattern as Log.test.tsx.
//
// The single strongest assertion in this file is a negative one: for a
// running entry, there is NO end-time control in the DOM at all — not a
// disabled one, not an empty one. BUILD_SPEC: "its end time is not editable
// until paused or stopped," and the acceptance check specifically asks for
// the running-entry fixture to "expose no end-time edit" — the absence
// itself is the thing under test.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toTimeInputValue } from "./editTimeFields";
import Log from "./Log";
import type { LogState } from "./logController";

function baseState(overrides: Partial<LogState> = {}): LogState {
  return {
    dayKey: "2026-08-22",
    isToday: true,
    canGoNext: false,
    entries: [],
    totalLabel: "0m",
    emptyStateTeachLine: null,
    editingEntryId: null,
    editError: null,
    pendingUndo: null,
    ...overrides,
  };
}

const stoppedEntry = {
  id: "1",
  name: "Acme onboarding",
  rawName: "Acme onboarding",
  startLabel: "9:00 AM",
  endLabel: "10:30 AM",
  durationLabel: "1h 30m",
  client: "acme",
  project: "rollout",
  isRunning: false,
  startIso: new Date(2026, 7, 22, 9, 0).toISOString(),
  endIso: new Date(2026, 7, 22, 10, 30).toISOString(),
};

const runningEntry = {
  id: "2",
  name: "Live task",
  rawName: "Live task",
  startLabel: "11:00 AM",
  endLabel: "11:12 AM",
  durationLabel: "12m",
  client: null,
  project: null,
  isRunning: true,
  startIso: new Date(2026, 7, 22, 11, 0).toISOString(),
  endIso: null,
};

function renderLog(overrides: Partial<React.ComponentProps<typeof Log>> = {}) {
  const handlers = {
    onToday: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onBeginEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onDelete: vi.fn(),
    onUndo: vi.fn(),
    onDismissUndo: vi.fn(),
  };
  const props: React.ComponentProps<typeof Log> = {
    locale: "en",
    state: baseState(),
    ...handlers,
    ...overrides,
  };
  const result = render(<Log {...props} />);
  return { ...result, ...handlers };
}

describe("Log — entering and leaving edit mode", () => {
  it("each entry has an Edit button that enters edit mode for that entry", () => {
    const { onBeginEdit } = renderLog({ state: baseState({ entries: [stoppedEntry] }) });
    fireEvent.click(screen.getByRole("button", { name: /edit acme onboarding/i }));
    expect(onBeginEdit).toHaveBeenCalledWith("1");
  });

  it("the editing entry renders a form with Name, Client, Project, Start, and End fields pre-filled", () => {
    renderLog({ state: baseState({ entries: [stoppedEntry], editingEntryId: "1" }) });

    expect(screen.getByLabelText("Name")).toHaveValue("Acme onboarding");
    expect(screen.getByLabelText("Client")).toHaveValue("acme");
    expect(screen.getByLabelText("Project")).toHaveValue("rollout");
    expect(screen.getByLabelText("Start")).toHaveValue(toTimeInputValue(stoppedEntry.startIso));
    expect(screen.getByLabelText("End")).toHaveValue(toTimeInputValue(stoppedEntry.endIso!));
  });

  it("Cancel exits edit mode without saving", () => {
    const { onCancelEdit, onSaveEdit } = renderLog({
      state: baseState({ entries: [stoppedEntry], editingEntryId: "1" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
    expect(onSaveEdit).not.toHaveBeenCalled();
  });

  it("only one entry is in edit mode at a time — a second entry stays in its static view", () => {
    renderLog({
      state: baseState({ entries: [stoppedEntry, runningEntry], editingEntryId: "1" }),
    });
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    // The running entry's static name is still rendered as plain text.
    expect(screen.getByText("Live task")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Name")).toHaveLength(1);
  });
});

describe("Log — saving an edit", () => {
  it("Save calls onSaveEdit with the entryId and the edited fields", () => {
    const { onSaveEdit } = renderLog({
      state: baseState({ entries: [stoppedEntry], editingEntryId: "1" }),
    });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed task" } });
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "newclient" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "09:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaveEdit).toHaveBeenCalledTimes(1);
    const [entryId, fields] = onSaveEdit.mock.calls[0]!;
    expect(entryId).toBe("1");
    expect(fields.name).toBe("Renamed task");
    expect(fields.client).toBe("newclient");
    expect(fields.project).toBe("rollout");
    expect(toTimeInputValue(fields.start)).toBe("09:15");
    expect(toTimeInputValue(fields.end)).toBe(toTimeInputValue(stoppedEntry.endIso!));
  });

  it("an empty Name field saves as null (auto-name), not an empty string", () => {
    const { onSaveEdit } = renderLog({
      state: baseState({ entries: [stoppedEntry], editingEntryId: "1" }),
    });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveEdit.mock.calls[0]![1].name).toBeNull();
  });

  it("empty Client/Project fields save as null", () => {
    const { onSaveEdit } = renderLog({
      state: baseState({ entries: [stoppedEntry], editingEntryId: "1" }),
    });
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const fields = onSaveEdit.mock.calls[0]![1];
    expect(fields.client).toBeNull();
    expect(fields.project).toBeNull();
  });
});

describe("Log — the running entry exposes no end-time control at all", () => {
  it("editing the running entry has no End field in the DOM — not disabled, not empty, ABSENT", () => {
    renderLog({ state: baseState({ entries: [runningEntry], editingEntryId: "2" }) });

    expect(screen.queryByLabelText("End")).not.toBeInTheDocument();
    // Confirm the query would have found it on a non-running entry, so this
    // isn't a false negative from a typo in the selector.
    expect(screen.getByLabelText("Start")).toBeInTheDocument();
  });

  it("explains the absence instead of leaving a silent gap (Design principle 6: every state is designed)", () => {
    renderLog({ state: baseState({ entries: [runningEntry], editingEntryId: "2" }) });
    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });

  it("Save on the running entry never includes an `end` field", () => {
    const { onSaveEdit } = renderLog({ state: baseState({ entries: [runningEntry], editingEntryId: "2" }) });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveEdit.mock.calls[0]![1].end).toBeUndefined();
  });

  it("Delete is disabled for the running entry", () => {
    renderLog({ state: baseState({ entries: [runningEntry] }) });
    expect(screen.getByRole("button", { name: /delete live task/i })).toBeDisabled();
  });
});

describe("Log — the designed inline overlap error", () => {
  it("renders the error message next to the entry being edited, as a real alert region", () => {
    renderLog({
      state: baseState({
        entries: [stoppedEntry],
        editingEntryId: "1",
        editError: { entryId: "1", code: "overlap", message: "Overlaps another entry." },
      }),
    });
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Overlaps another entry.")).toBeInTheDocument();
  });

  it("an editError for a DIFFERENT entry does not render on this one", () => {
    renderLog({
      state: baseState({
        entries: [stoppedEntry],
        editingEntryId: "1",
        editError: { entryId: "some-other-id", code: "overlap", message: "Overlaps another entry." },
      }),
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no alert renders when editError is null", () => {
    renderLog({ state: baseState({ entries: [stoppedEntry], editingEntryId: "1", editError: null }) });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Log — delete and the undo toast", () => {
  it("Delete calls onDelete with the entry id", () => {
    const { onDelete } = renderLog({ state: baseState({ entries: [stoppedEntry] }) });
    fireEvent.click(screen.getByRole("button", { name: /delete acme onboarding/i }));
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("the undo toast renders the deleted entry's name, an Undo button, and a dismiss control", () => {
    const { onUndo, onDismissUndo } = renderLog({
      state: baseState({ pendingUndo: { entryId: "1", label: "Acme onboarding" } }),
    });
    expect(screen.getByText(/Acme onboarding/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissUndo).toHaveBeenCalledTimes(1);
  });

  it("no undo toast renders when pendingUndo is null", () => {
    renderLog({ state: baseState({ pendingUndo: null }) });
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});

describe("Log — edit controls in es", () => {
  it("renders idiomatic Spanish labels for the edit form and buttons", () => {
    renderLog({ locale: "es", state: baseState({ entries: [stoppedEntry], editingEntryId: "1" }) });
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("Proyecto")).toBeInTheDocument();
    expect(screen.getByLabelText("Inicio")).toBeInTheDocument();
    expect(screen.getByLabelText("Fin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("renders idiomatic Spanish for the undo toast", () => {
    renderLog({
      locale: "es",
      state: baseState({ pendingUndo: { entryId: "1", label: "Acme onboarding" } }),
    });
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument();
  });
});

describe("Log — every edit/delete/undo control is a real, keyboard-reachable button", () => {
  it("no clickable div stands in for a button anywhere in edit mode or the undo toast", () => {
    renderLog({
      state: baseState({
        entries: [stoppedEntry],
        editingEntryId: "1",
        pendingUndo: { entryId: "9", label: "Something else" },
      }),
    });
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toHaveAttribute("tabindex", "-1");
    }
  });
});
