// S6/S11: `App` is the real Dashboard shell (BUILD_SPEC S6/S11 rows) — it
// was an S1 placeholder rendering two lines of text, then an S6 shell with
// exactly one always-selected tab; this slice (S11) makes tab SWITCHING
// real, since Insights is the first second tab the Dashboard ever gets.
// Settings (S12) is NOT stubbed here yet — BUILD_SPEC's rollout notes say
// build the shell only as far as the current slice needs.
//
// `App` stays a pure, Tauri-free component (props in, named content slots
// in) so it is testable without a real window — the live engine wiring that
// actually produces each tab's content lives in `log/LogContainer.tsx` /
// `insights/InsightsContainer.tsx` + `app/DashboardContainer.tsx`, exercised
// live at the S14 manual-check gate, same "no unit test for the IPC glue"
// convention as every other window's container.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App — Dashboard tab shell", () => {
  it("renders the Log tab, selected, in en", () => {
    render(<App locale="en" />);
    const tab = screen.getByRole("tab", { name: "Log" });
    expect(tab).toBeInTheDocument();
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("renders the distinct es literal for the same tab — idiomatic, not a cognate", () => {
    render(<App locale="es" />);
    expect(screen.getByRole("tab", { name: "Registro" })).toBeInTheDocument();
  });

  it("renders whatever is passed as logContent inside the Log tabpanel while Log is selected", () => {
    render(<App locale="en" logContent={<div data-testid="log-content">seeded day content</div>} />);
    expect(screen.getByTestId("log-content")).toBeInTheDocument();
    expect(screen.getByText("seeded day content")).toBeInTheDocument();
  });

  it("defaults to English when no locale is given", () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: "Log" })).toBeInTheDocument();
  });

  it("the Log tab is a real, keyboard-reachable control", () => {
    render(<App locale="en" />);
    const tab = screen.getByRole("tab", { name: "Log" });
    expect(tab.tagName).toBe("BUTTON");
    expect(tab).not.toHaveAttribute("tabindex", "-1");
  });
});

describe("App — Insights tab (S11)", () => {
  it("renders an Insights tab, NOT selected by default, in en", () => {
    render(<App locale="en" />);
    const tab = screen.getByRole("tab", { name: "Insights" });
    expect(tab).toBeInTheDocument();
    expect(tab).toHaveAttribute("aria-selected", "false");
  });

  it("renders the distinct es literal for the Insights tab — idiomatic ('Estadísticas'), not the 'Perspectivas' cognate", () => {
    render(<App locale="es" />);
    expect(screen.getByRole("tab", { name: "Estadísticas" })).toBeInTheDocument();
  });

  it("the Insights tab is a real, keyboard-reachable control", () => {
    render(<App locale="en" />);
    const tab = screen.getByRole("tab", { name: "Insights" });
    expect(tab.tagName).toBe("BUTTON");
    expect(tab).not.toHaveAttribute("tabindex", "-1");
  });

  it("clicking the Insights tab selects it, deselects Log, and swaps the visible content", () => {
    render(
      <App
        locale="en"
        logContent={<div data-testid="log-content">log stuff</div>}
        insightsContent={<div data-testid="insights-content">insights stuff</div>}
      />,
    );

    expect(screen.getByTestId("log-content")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Insights" }));

    expect(screen.getByRole("tab", { name: "Insights" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Log" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("insights-content")).toBeInTheDocument();
    // The literal point of this test: Log's content must NOT still be
    // mounted once Insights is the active tab — before this slice, `App`
    // rendered whatever `children` it was given unconditionally, which
    // would have left both tabs' content sharing the screen regardless of
    // which tab button looked selected.
    expect(screen.queryByTestId("log-content")).not.toBeInTheDocument();
  });

  it("clicking back to Log restores Log's content and hides Insights'", () => {
    render(
      <App
        locale="en"
        logContent={<div data-testid="log-content">log stuff</div>}
        insightsContent={<div data-testid="insights-content">insights stuff</div>}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Insights" }));
    fireEvent.click(screen.getByRole("tab", { name: "Log" }));

    expect(screen.getByRole("tab", { name: "Log" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("log-content")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-content")).not.toBeInTheDocument();
  });

  it("each tab's tabpanel is properly associated via aria-controls/aria-labelledby (accessibility floor)", () => {
    render(<App locale="en" logContent={<div>x</div>} />);
    const logTab = screen.getByRole("tab", { name: "Log" });
    const panel = screen.getByRole("tabpanel");
    expect(logTab.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    expect(panel.getAttribute("aria-labelledby")).toBe(logTab.getAttribute("id"));
  });
});
