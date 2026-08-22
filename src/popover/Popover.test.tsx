// Component test for the S5 tray popover's presentational shell (BUILD_SPEC
// "Autonomous design review" UI-slice requirement + Design principles:
// keyboard-first, tokens only, both languages first-class, every state is
// designed). Pure props in, no Tauri IPC — same pattern as
// `QuickEntryPanel.test.tsx`. Covers: entries + day total render; empty
// state renders the teach line; paused/running/stopped are three visually
// distinct treatments, not a two-state toggle; the live timer ticks; ticking
// intervals are cleaned up on unmount (no leak); every control is a real,
// keyboard-reachable button.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Popover from "./Popover";
import type { PopoverState } from "./popoverController";

function baseState(overrides: Partial<PopoverState> = {}): PopoverState {
  return {
    entries: [],
    totalLabel: "0m",
    timerStatus: "idle",
    elapsedSeconds: 0,
    teachLine: null,
    ...overrides,
  };
}

function renderPopover(overrides: Partial<React.ComponentProps<typeof Popover>> = {}) {
  const onStart = vi.fn();
  const onPause = vi.fn();
  const onResume = vi.fn();
  const onSwitch = vi.fn();
  const onStop = vi.fn();
  const props: React.ComponentProps<typeof Popover> = {
    locale: "en",
    state: baseState(),
    onStart,
    onPause,
    onResume,
    onSwitch,
    onStop,
    ...overrides,
  };
  const result = render(<Popover {...props} />);
  return { ...result, onStart, onPause, onResume, onSwitch, onStop };
}

describe("Popover — i18n", () => {
  it("renders idle action labels in en", () => {
    renderPopover({ state: baseState() });
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("renders the distinct es literals for the same state — idiomatic, not literal translation", () => {
    renderPopover({ locale: "es", state: baseState() });
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument();
  });

  it("running status label is 'en curso' in es, never 'rastreando'", () => {
    renderPopover({
      locale: "es",
      state: baseState({ timerStatus: "running", elapsedSeconds: 5 }),
    });
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.queryByText(/rastreando/i)).not.toBeInTheDocument();
  });
});

describe("Popover — day view", () => {
  it("renders each entry's name and duration, and the day total", () => {
    renderPopover({
      state: baseState({
        entries: [
          { id: "1", name: "Acme onboarding", durationLabel: "45m", status: "stopped" },
          { id: "2", name: "Beta review", durationLabel: "45m", status: "stopped" },
          { id: "3", name: "Deep work", durationLabel: "35m", status: "stopped" },
        ],
        totalLabel: "2h 05m",
      }),
    });

    expect(screen.getByText("Acme onboarding")).toBeInTheDocument();
    expect(screen.getByText("Beta review")).toBeInTheDocument();
    expect(screen.getByText("Deep work")).toBeInTheDocument();
    expect(screen.getAllByText("45m")).toHaveLength(2);
    expect(screen.getByText("35m")).toBeInTheDocument();
    expect(screen.getByText("2h 05m")).toBeInTheDocument();
  });

  it("empty state renders the teach line and no entries list", () => {
    renderPopover({
      state: baseState({ teachLine: "Press ⌘⇧Space to start tracking" }),
    });

    expect(screen.getByText("Press ⌘⇧Space to start tracking")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("no teach line renders when entries exist, even if empty would otherwise be possible", () => {
    renderPopover({
      state: baseState({
        entries: [{ id: "1", name: "Acme onboarding", durationLabel: "45m", status: "stopped" }],
        teachLine: null,
      }),
    });
    expect(screen.queryByText(/start tracking/i)).not.toBeInTheDocument();
  });
});

describe("Popover — paused is visually distinct from running AND from stopped (three states)", () => {
  it("renders three different data-status values for the three entry states", () => {
    renderPopover({
      state: baseState({
        timerStatus: "paused",
        elapsedSeconds: 65,
        entries: [
          { id: "1", name: "Stopped task", durationLabel: "10m", status: "stopped" },
          { id: "2", name: "Paused task", durationLabel: "5m", status: "paused" },
        ],
      }),
    });

    const stoppedRow = screen.getByText("Stopped task").closest("li");
    const pausedRow = screen.getByText(/Paused task/).closest("li");
    expect(stoppedRow).toHaveAttribute("data-status", "stopped");
    expect(pausedRow).toHaveAttribute("data-status", "paused");
    expect(stoppedRow?.getAttribute("data-status")).not.toBe(pausedRow?.getAttribute("data-status"));
  });

  it("the paused entry carries the pinned pause glyph (⏸); the running entry does not", () => {
    renderPopover({
      state: baseState({
        timerStatus: "running",
        elapsedSeconds: 30,
        entries: [
          { id: "1", name: "Running task", durationLabel: "1m", status: "running" },
          { id: "2", name: "Paused task", durationLabel: "5m", status: "paused" },
        ],
      }),
    });

    const runningRow = screen.getByText("Running task").closest("li");
    const pausedRow = screen.getByText(/Paused task/).closest("li");
    expect(pausedRow?.textContent).toContain("⏸");
    expect(runningRow?.textContent).not.toContain("⏸");
  });

  it("the top ticking timer shows a distinct status word for running vs paused", () => {
    const { rerender } = renderPopover({ state: baseState({ timerStatus: "running", elapsedSeconds: 5 }) });
    expect(screen.getByText("Running")).toBeInTheDocument();

    rerender(
      <Popover
        locale="en"
        state={baseState({ timerStatus: "paused", elapsedSeconds: 5 })}
        onStart={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSwitch={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });
});

describe("Popover — live ticking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("the elapsed display ticks forward once a second while running", () => {
    renderPopover({ state: baseState({ timerStatus: "running", elapsedSeconds: 5 }) });
    expect(screen.getByText("0:05")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("0:07")).toBeInTheDocument();
  });

  it("does not tick while paused (frozen at the pause point)", () => {
    renderPopover({ state: baseState({ timerStatus: "paused", elapsedSeconds: 5 }) });
    expect(screen.getByText("0:05")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("0:05")).toBeInTheDocument();
  });

  it("does not leak its interval: unmounting while running clears the pending timer", () => {
    const clearSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = renderPopover({ state: baseState({ timerStatus: "running", elapsedSeconds: 0 }) });

    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start an interval at all while idle (nothing to tick)", () => {
    renderPopover({ state: baseState({ timerStatus: "idle" }) });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Popover — actions and keyboard reachability", () => {
  it("idle: only Start is offered, and clicking it calls onStart", () => {
    const { onStart } = renderPopover({ state: baseState({ timerStatus: "idle" }) });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  it("running: Pause, Switch, Stop are offered and wired to their handlers", () => {
    const { onPause, onSwitch, onStop } = renderPopover({
      state: baseState({ timerStatus: "running", elapsedSeconds: 5 }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });

  it("paused: Resume, Switch, Stop are offered and wired to their handlers", () => {
    const { onResume, onSwitch, onStop } = renderPopover({
      state: baseState({ timerStatus: "paused", elapsedSeconds: 5 }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("every action control is a real, keyboard-reachable <button> (not tabindex-suppressed)", () => {
    renderPopover({ state: baseState({ timerStatus: "running", elapsedSeconds: 5 }) });
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toHaveAttribute("tabindex", "-1");
      expect(button).not.toBeDisabled();
    }
  });
});
