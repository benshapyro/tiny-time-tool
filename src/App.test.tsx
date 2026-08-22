// S6: `App` becomes the real Dashboard shell (BUILD_SPEC S6 row) — it was
// an S1 placeholder rendering two lines of text; this is the slice that
// makes it real. Only as much tab shell as S6 needs: a single "Log" tab,
// selected, hosting whatever content is passed in. Insights (S11) and
// Settings (S12) tabs are NOT stubbed here — BUILD_SPEC's rollout notes say
// build the shell only as far as the current slice needs.
//
// `App` stays a pure, Tauri-free component (props in, children in) so it is
// testable without a real window — the live engine wiring that actually
// produces the Log tab's content lives in `log/LogContainer.tsx` +
// `app/DashboardContainer.tsx`, exercised live at the S14 manual-check
// gate, same "no unit test for the IPC glue" convention as every other
// window's container.

import { render, screen } from "@testing-library/react";
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

  it("renders whatever content is passed as children inside the tabpanel", () => {
    render(
      <App locale="en">
        <div data-testid="log-content">seeded day content</div>
      </App>,
    );
    expect(screen.getByTestId("log-content")).toBeInTheDocument();
    expect(screen.getByText("seeded day content")).toBeInTheDocument();
  });

  it("defaults to English when no locale is given", () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: "Log" })).toBeInTheDocument();
  });

  it("the tab is a real, keyboard-reachable control", () => {
    render(<App locale="en" />);
    const tab = screen.getByRole("tab", { name: "Log" });
    expect(tab.tagName).toBe("BUTTON");
    expect(tab).not.toHaveAttribute("tabindex", "-1");
  });
});
