// S11 Dashboard Insights tab — component tests against plain props (no
// engine, no Tauri IPC — see `Insights.tsx`'s module doc comment). Two
// concerns get special weight here, both literal BUILD_SPEC acceptance
// clauses: "exactly three views" and "no date-range builder." Both are
// tested as POSITIVE, unfakeable assertions (an exact child count, plus
// zero `<input>`/`<button>` elements anywhere), not "query for one specific
// bad thing and assert it's absent" — the same lesson S7's own module
// comment names: a typo in a narrow selector can make an absence test pass
// for the wrong reason.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Insights from "./Insights";
import type { InsightsState } from "./insightsController";

const FILLED_STATE: InsightsState = {
  days: [
    { dayKey: "2026-08-17", weekdayLabel: "Mon", durationLabel: "0m", seconds: 0 },
    { dayKey: "2026-08-18", weekdayLabel: "Tue", durationLabel: "6h 30m", seconds: 6.5 * 3600 },
    { dayKey: "2026-08-19", weekdayLabel: "Wed", durationLabel: "5h 15m", seconds: 5.25 * 3600 },
    { dayKey: "2026-08-20", weekdayLabel: "Thu", durationLabel: "1h 00m", seconds: 3600 },
    { dayKey: "2026-08-21", weekdayLabel: "Fri", durationLabel: "1h 00m", seconds: 3600 },
    { dayKey: "2026-08-22", weekdayLabel: "Sat", durationLabel: "1h 10m", seconds: 70 * 60 },
    { dayKey: "2026-08-23", weekdayLabel: "Sun", durationLabel: "0m", seconds: 0 },
  ],
  maxDaySeconds: 6.5 * 3600,
  clientShares: [
    { tag: "acme", durationLabel: "9h 15m", percentLabel: "62%" },
    { tag: "beta", durationLabel: "4h 30m", percentLabel: "30%" },
  ],
  projectShares: [
    { tag: "rollout", durationLabel: "9h 15m", percentLabel: "62%" },
    { tag: "core", durationLabel: "3h 30m", percentLabel: "23%" },
    { tag: "discovery", durationLabel: "1h 00m", percentLabel: "7%" },
  ],
  biggestTasks: [
    { name: "Acme onboarding", client: "acme", project: "rollout", durationLabel: "9h 15m" },
    { name: "Beta standup", client: "beta", project: "core", durationLabel: "3h 30m" },
    { name: "Internal sync", client: null, project: null, durationLabel: "1h 10m" },
    { name: "Acme onboarding", client: "beta", project: "discovery", durationLabel: "1h 00m" },
  ],
  isEmpty: false,
};

const EMPTY_STATE: InsightsState = {
  days: FILLED_STATE.days.map((d) => ({ ...d, durationLabel: "0m", seconds: 0 })),
  maxDaySeconds: 0,
  clientShares: [],
  projectShares: [],
  biggestTasks: [],
  isEmpty: true,
};

describe("Insights — exactly three views (BUILD_SPEC S11: literal acceptance clause)", () => {
  it("renders EXACTLY three top-level views — a positive count, not a check for one known-bad extra", () => {
    const { container } = render(<Insights locale="en" state={FILLED_STATE} />);
    const views = container.querySelectorAll(".insights__views > *");
    expect(views).toHaveLength(3);
  });

  it("each of the three required views is genuinely present (positive assertion — a wrong/typo'd selector above could not silently pass this)", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    expect(screen.getByTestId("insights-week-bars")).toBeInTheDocument();
    expect(screen.getByTestId("insights-tag-share")).toBeInTheDocument();
    expect(screen.getByTestId("insights-top-tasks")).toBeInTheDocument();
  });

  it("the three-view count holds even in the empty-week state (an empty banner is not a fourth view)", () => {
    const { container } = render(<Insights locale="en" state={EMPTY_STATE} />);
    const views = container.querySelectorAll(".insights__views > *");
    expect(views).toHaveLength(3);
  });
});

describe("Insights — no date-range builder (decisions.md #27's explicit scope limit)", () => {
  it("renders zero <input> elements anywhere", () => {
    const { container } = render(<Insights locale="en" state={FILLED_STATE} />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("renders zero <button> elements anywhere — this is a pure read surface, no mutating actions either", () => {
    const { container } = render(<Insights locale="en" state={FILLED_STATE} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("renders no element with role='textbox' or a date-picker-shaped control", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });
});

describe("Insights — hours by day", () => {
  it("renders all 7 days with their weekday labels and duration labels, including the pinned Tue = 6h 30m", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    const view = screen.getByTestId("insights-week-bars");
    const rows = within(view).getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    expect(rows).toHaveLength(7);
    expect(within(view).getByText("6h 30m")).toBeInTheDocument();
  });
});

describe("Insights — share by tag", () => {
  it("renders both a client list and a project list, each tag prefixed and with its percent + duration", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    const view = screen.getByTestId("insights-tag-share");
    expect(within(view).getByText("@acme")).toBeInTheDocument();
    expect(within(view).getByText("#rollout")).toBeInTheDocument();
    // 62% appears twice — once under "By client" (@acme), once under "By
    // project" (#rollout) — both pinned values in this fixture.
    expect(within(view).getAllByText("62%")).toHaveLength(2);
  });

  it("an empty tag list (no client-tagged time) renders the designed empty sub-state, not a blank gap", () => {
    const state: InsightsState = { ...FILLED_STATE, clientShares: [] };
    render(<Insights locale="en" state={state} />);
    const view = screen.getByTestId("insights-tag-share");
    expect(within(view).getByText("No tagged time yet")).toBeInTheDocument();
  });
});

describe("Insights — biggest tasks", () => {
  it("renders the top task first with its name, client, project tags, and duration — the pinned 'Acme onboarding — 9h 15m'", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    const view = screen.getByTestId("insights-top-tasks");
    const items = within(view).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Acme onboarding");
    expect(items[0]).toHaveTextContent("@acme");
    expect(items[0]).toHaveTextContent("#rollout");
    expect(items[0]).toHaveTextContent("9h 15m");
  });

  it("two rows with the SAME name but a DIFFERENT client render as visibly distinct rows, each with its own tags", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    const view = screen.getByTestId("insights-top-tasks");
    const acmeOnboardingRows = within(view).getAllByText("Acme onboarding");
    expect(acmeOnboardingRows).toHaveLength(2);
    const items = within(view).getAllByRole("listitem");
    const rollout = items.find((li) => li.textContent?.includes("#rollout"));
    const discovery = items.find((li) => li.textContent?.includes("#discovery"));
    expect(rollout).toBeDefined();
    expect(discovery).toBeDefined();
    expect(rollout).not.toBe(discovery);
  });

  it("a task with neither client nor project renders with no tag chips, not a stray '@' or '#'", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    const view = screen.getByTestId("insights-top-tasks");
    const items = within(view).getAllByRole("listitem");
    const internalSync = items.find((li) => li.textContent?.includes("Internal sync"))!;
    expect(internalSync).not.toHaveTextContent("@");
    expect(internalSync).not.toHaveTextContent("#");
  });

  it("an empty task list renders the designed empty sub-state", () => {
    const state: InsightsState = { ...FILLED_STATE, biggestTasks: [] };
    render(<Insights locale="en" state={state} />);
    const view = screen.getByTestId("insights-top-tasks");
    expect(within(view).getByText("No named tasks yet")).toBeInTheDocument();
  });
});

describe("Insights — empty week (Design principle 6: every state is designed)", () => {
  it("renders a designed empty-week message when isEmpty is true", () => {
    render(<Insights locale="en" state={EMPTY_STATE} />);
    expect(screen.getByText("No time tracked yet this week.")).toBeInTheDocument();
  });

  it("does not render the empty-week message when isEmpty is false", () => {
    render(<Insights locale="en" state={FILLED_STATE} />);
    expect(screen.queryByText("No time tracked yet this week.")).not.toBeInTheDocument();
  });
});

describe("Insights — es locale (idiomatic strings, not literal cognates)", () => {
  it("renders the es view titles, distinct from en", () => {
    render(<Insights locale="es" state={FILLED_STATE} />);
    expect(screen.getByText("Horas por día")).toBeInTheDocument();
    expect(screen.getByText("Reparto por etiqueta")).toBeInTheDocument();
    expect(screen.getByText("Tareas principales")).toBeInTheDocument();
  });

  it("still renders exactly three views in es", () => {
    const { container } = render(<Insights locale="es" state={FILLED_STATE} />);
    expect(container.querySelectorAll(".insights__views > *")).toHaveLength(3);
  });
});
