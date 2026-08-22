import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App i18n smoke", () => {
  it("renders the English string for a given key", () => {
    render(<App locale="en" />);
    expect(screen.getByText("Open Dashboard")).toBeInTheDocument();
  });

  it("renders the distinct Spanish string for the same key", () => {
    render(<App locale="es" />);
    expect(screen.getByText("Abrir panel")).toBeInTheDocument();
  });
});
