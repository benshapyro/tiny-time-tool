// BUILD_SPEC S4: "autocomplete over recent task names after 2 chars."
// Pinned acceptance check: "autocomplete returns the 2 matching fixtures
// for prefix 'Ac'."

import { describe, expect, it } from "vitest";
import { filterAutocomplete, MIN_AUTOCOMPLETE_CHARS } from "./autocomplete";

const FIXTURES = ["Acme onboarding", "Acme deep-dive", "Beta review", "Client sync"];

describe("filterAutocomplete", () => {
  it("returns the 2 matching fixtures for prefix 'Ac'", () => {
    expect(filterAutocomplete(FIXTURES, "Ac")).toEqual(["Acme onboarding", "Acme deep-dive"]);
  });

  it("is case-insensitive", () => {
    expect(filterAutocomplete(FIXTURES, "ac")).toEqual(["Acme onboarding", "Acme deep-dive"]);
    expect(filterAutocomplete(FIXTURES, "BETA")).toEqual(["Beta review"]);
  });

  it("matches by prefix only, not substring", () => {
    expect(filterAutocomplete(FIXTURES, "sync")).toEqual([]); // "Client sync" doesn't start with it
  });

  it("returns no suggestions below the 2-character threshold", () => {
    expect(filterAutocomplete(FIXTURES, "")).toEqual([]);
    expect(filterAutocomplete(FIXTURES, "A")).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterAutocomplete(FIXTURES, "Zz")).toEqual([]);
  });

  it("exposes the pinned 2-character threshold as a constant", () => {
    expect(MIN_AUTOCOMPLETE_CHARS).toBe(2);
  });
});
