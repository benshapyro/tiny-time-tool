// Component test for the S6 Dashboard Log tab's presentational shell
// (BUILD_SPEC S6 row + Design principles: keyboard-first, tokens only, both
// languages first-class, every state is designed). Pure props in, no Tauri
// IPC — same pattern as `Popover.test.tsx`. Covers: entries render with
// times/duration/tags and the day total; empty state renders the teach
// line and no entries list; date-nav controls are real, keyboard-reachable
// buttons wired to their handlers; the Today jump button only appears once
// navigated away from today.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    ...overrides,
  };
}

function renderLog(overrides: Partial<React.ComponentProps<typeof Log>> = {}) {
  const onToday = vi.fn();
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const props: React.ComponentProps<typeof Log> = {
    locale: "en",
    state: baseState(),
    onToday,
    onPrevious,
    onNext,
    ...overrides,
  };
  const result = render(<Log {...props} />);
  return { ...result, onToday, onPrevious, onNext };
}

describe("Log — day view", () => {
  it("renders each entry's name, time range, duration, and tags, plus the day total", () => {
    renderLog({
      state: baseState({
        entries: [
          {
            id: "1",
            name: "Acme onboarding",
            startLabel: "9:00 AM",
            endLabel: "10:30 AM",
            durationLabel: "1h 30m",
            client: "acme",
            project: "rollout",
          },
          {
            id: "2",
            name: "Aug 22 · 11:00 AM–11:45 AM",
            startLabel: "11:00 AM",
            endLabel: "11:45 AM",
            durationLabel: "45m",
            client: null,
            project: null,
          },
        ],
        totalLabel: "2h 15m",
      }),
    });

    expect(screen.getByText("Acme onboarding")).toBeInTheDocument();
    expect(screen.getByText("9:00 AM–10:30 AM")).toBeInTheDocument();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("@acme")).toBeInTheDocument();
    expect(screen.getByText("#rollout")).toBeInTheDocument();

    expect(screen.getByText("Aug 22 · 11:00 AM–11:45 AM")).toBeInTheDocument();
    expect(screen.getByText("11:00 AM–11:45 AM")).toBeInTheDocument();
    expect(screen.getByText("45m")).toBeInTheDocument();

    expect(screen.getByText("2h 15m")).toBeInTheDocument();
  });

  it("renders no tag chips for an entry with neither client nor project", () => {
    renderLog({
      state: baseState({
        entries: [
          {
            id: "1",
            name: "Deep work",
            startLabel: "1:00 PM",
            endLabel: "1:35 PM",
            durationLabel: "35m",
            client: null,
            project: null,
          },
        ],
      }),
    });

    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it("empty state renders the teach line and no entries list", () => {
    renderLog({
      state: baseState({ emptyStateTeachLine: "Press ⌘⇧Space to start tracking" }),
    });

    expect(screen.getByText("Press ⌘⇧Space to start tracking")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("no teach line renders when entries exist", () => {
    renderLog({
      state: baseState({
        entries: [
          {
            id: "1",
            name: "Deep work",
            startLabel: "1:00 PM",
            endLabel: "1:35 PM",
            durationLabel: "35m",
            client: null,
            project: null,
          },
        ],
        emptyStateTeachLine: null,
      }),
    });
    expect(screen.queryByText(/start tracking/i)).not.toBeInTheDocument();
  });
});

describe("Log — i18n", () => {
  it("renders 'Today' as the date label in en when isToday", () => {
    renderLog({ state: baseState({ isToday: true }) });
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("renders the idiomatic es literal for the same state", () => {
    renderLog({ locale: "es", state: baseState({ isToday: true }) });
    expect(screen.getByText("Hoy")).toBeInTheDocument();
  });

  it("renders the localized long date when viewing a day other than today", () => {
    renderLog({ state: baseState({ isToday: false, dayKey: "2026-08-20", canGoNext: true }) });
    expect(screen.getByText("Thursday, August 20, 2026")).toBeInTheDocument();
  });

  it("renders the idiomatic es long date when viewing a day other than today", () => {
    renderLog({
      locale: "es",
      state: baseState({ isToday: false, dayKey: "2026-08-20", canGoNext: true }),
    });
    expect(screen.getByText("jueves, 20 de agosto de 2026")).toBeInTheDocument();
  });
});

describe("Log — date navigation controls", () => {
  it("Previous and Next are always-present, keyboard-reachable buttons wired to their handlers", () => {
    const { onPrevious, onNext } = renderLog({ state: baseState({ canGoNext: true }) });
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("Next is disabled when canGoNext is false (bounded at today)", () => {
    renderLog({ state: baseState({ canGoNext: false }) });
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
  });

  it("Next is enabled when canGoNext is true", () => {
    renderLog({ state: baseState({ canGoNext: true, isToday: false, dayKey: "2026-08-20" }) });
    expect(screen.getByRole("button", { name: "Next day" })).not.toBeDisabled();
  });

  it("a 'Today' jump button appears only once navigated away from today, and calls onToday", () => {
    const { onToday, rerender } = renderLog({ state: baseState({ isToday: true }) });
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();

    rerender(
      <Log
        locale="en"
        state={baseState({ isToday: false, dayKey: "2026-08-20", canGoNext: true })}
        onToday={onToday}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const todayButton = screen.getByRole("button", { name: "Today" });
    fireEvent.click(todayButton);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("every date-nav control is a real, keyboard-reachable <button>", () => {
    renderLog({ state: baseState({ isToday: false, dayKey: "2026-08-20", canGoNext: true }) });
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toHaveAttribute("tabindex", "-1");
    }
  });
});
