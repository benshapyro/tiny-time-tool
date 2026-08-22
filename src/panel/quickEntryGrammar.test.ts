// BUILD_SPEC S4 pinned parse grammar (Pinned interfaces):
//   (?<=^|\s)([@#])([\p{L}\p{N}_-]+)(?=\s|$)
// First `@` -> client, first `#` -> project; matched tokens removed from
// the name; later `@`/`#` tokens stay literal in the name. Remainder
// trimmed -> name; empty remainder -> null.

import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "./quickEntryGrammar";

describe("parseQuickEntry (BUILD_SPEC pinned grammar)", () => {
  it("splits name/client/project from a fully-tagged string", () => {
    expect(parseQuickEntry("Acme onboarding @acme #rollout")).toEqual({
      name: "Acme onboarding",
      client: "acme",
      project: "rollout",
    });
  });

  it("keeps a second @ token literal in the name once the first has claimed client", () => {
    expect(parseQuickEntry("@acme deep-dive @beta #x")).toEqual({
      name: "deep-dive @beta",
      client: "acme",
      project: "x",
    });
  });

  it("keeps a second # token literal in the name once the first has claimed project", () => {
    expect(parseQuickEntry("#rollout research #other-tag")).toEqual({
      name: "research #other-tag",
      client: null,
      project: "rollout",
    });
  });

  it("plain text with no tokens has a name and null client/project", () => {
    expect(parseQuickEntry("Just typing a task")).toEqual({
      name: "Just typing a task",
      client: null,
      project: null,
    });
  });

  it("empty input (or all-whitespace) yields a null name", () => {
    expect(parseQuickEntry("")).toEqual({ name: null, client: null, project: null });
    expect(parseQuickEntry("   ")).toEqual({ name: null, client: null, project: null });
  });

  it("a string that is only tag tokens yields a null name once tokens are removed", () => {
    expect(parseQuickEntry("@acme #rollout")).toEqual({ name: null, client: "acme", project: "rollout" });
  });

  it("accented letters and digits/hyphen/underscore are valid token characters", () => {
    expect(parseQuickEntry("Café review @clíent-42 #proyecto_2")).toEqual({
      name: "Café review",
      client: "clíent-42",
      project: "proyecto_2",
    });
  });

  it("an @ or # not at a whitespace/string boundary is not a token (e.g. embedded in a word)", () => {
    expect(parseQuickEntry("user@acme.com report")).toEqual({
      name: "user@acme.com report",
      client: null,
      project: null,
    });
  });

  it("tags may appear anywhere in the string, not only at the end", () => {
    expect(parseQuickEntry("@acme #rollout onboarding call")).toEqual({
      name: "onboarding call",
      client: "acme",
      project: "rollout",
    });
  });

  it("collapses the whitespace left behind by removed interior tokens", () => {
    expect(parseQuickEntry("before @acme after")).toEqual({ name: "before after", client: "acme", project: null });
  });
});
