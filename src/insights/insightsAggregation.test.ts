// S11: `hoursByDay`/`shareByTag`/`biggestTasks` against plain fixture
// `DayEntry[]` objects — no SQLite here (that end-to-end path, including the
// two-week current-week-filter proof, is `insightsController.test.ts`).
// This file is where the AGGREGATION RULES themselves are pinned precisely:
// exact-tuple grouping (not name alone), percentage-of-week-total (not
// percentage-of-tag-subtotal), and the top-5 cap — cases the controller's
// single seeded fixture doesn't need to carry.

import { describe, expect, it } from "vitest";
import type { Segment, TimeEntry } from "../timer/types";
import { biggestTasks, hoursByDay, shareByTag } from "./insightsAggregation";
import { currentWeekRange } from "./weekRange";
import type { DayEntry } from "../timer/timerEngine";

const NOW = new Date("2026-08-20T18:00:00.000Z");

function dayEntry(
  id: string,
  name: string | null,
  client: string | null,
  project: string | null,
  startIso: string,
  endIso: string | null,
): DayEntry {
  const entry: TimeEntry = { id, name, client, project, createdAt: startIso };
  const segments: Segment[] = [{ id: `${id}-seg`, entryId: id, startedAt: startIso, endedAt: endIso }];
  return { entry, segments };
}

describe("hoursByDay", () => {
  const weekRange = currentWeekRange(new Date(2026, 7, 18)); // 2026-08-17..2026-08-23

  it("buckets total seconds per local calendar day, one bucket per weekRange.dayKeys entry", () => {
    const entries = [
      dayEntry("a", "A", null, null, "2026-08-18T16:00:00.000Z", "2026-08-18T18:00:00.000Z"), // Tue, 2h
      dayEntry("b", "B", null, null, "2026-08-18T20:00:00.000Z", "2026-08-18T20:30:00.000Z"), // Tue, 30m
      dayEntry("c", "C", null, null, "2026-08-19T16:00:00.000Z", "2026-08-19T17:00:00.000Z"), // Wed, 1h
    ];
    const buckets = hoursByDay(entries, weekRange, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets.map((b) => b.dayKey)).toEqual(weekRange.dayKeys);
    const tue = buckets.find((b) => b.dayKey === "2026-08-18")!;
    expect(tue.seconds).toBe(2.5 * 3600);
    const wed = buckets.find((b) => b.dayKey === "2026-08-19")!;
    expect(wed.seconds).toBe(3600);
  });

  it("a day with no entries still renders its bucket at 0 seconds (every day is designed, not omitted)", () => {
    const buckets = hoursByDay([], weekRange, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.seconds === 0)).toBe(true);
  });

  it("groups a multi-segment entry by its FIRST segment's start day, summing all its segments there", () => {
    const entry: TimeEntry = { id: "m", name: "Multi", client: null, project: null, createdAt: "2026-08-18T16:00:00.000Z" };
    const segments: Segment[] = [
      { id: "m1", entryId: "m", startedAt: "2026-08-18T16:00:00.000Z", endedAt: "2026-08-18T17:00:00.000Z" }, // 1h
      { id: "m2", entryId: "m", startedAt: "2026-08-18T18:00:00.000Z", endedAt: "2026-08-18T19:00:00.000Z" }, // 1h
    ];
    const buckets = hoursByDay([{ entry, segments }], weekRange, NOW);
    const tue = buckets.find((b) => b.dayKey === "2026-08-18")!;
    expect(tue.seconds).toBe(2 * 3600);
  });
});

describe("shareByTag", () => {
  it("percentage is tag-seconds ÷ CURRENT-WEEK TOTAL (not the tag's own subtotal)", () => {
    const entries = [
      dayEntry("a", "A", "acme", "rollout", "2026-08-18T16:00:00.000Z", "2026-08-18T18:00:00.000Z"), // acme, 2h
      dayEntry("b", "B", "beta", "core", "2026-08-19T16:00:00.000Z", "2026-08-19T17:00:00.000Z"), // beta, 1h
      dayEntry("c", "C", null, null, "2026-08-20T16:00:00.000Z", "2026-08-20T17:00:00.000Z"), // untagged, 1h
    ];
    // Week total = 4h (14400s). acme = 2h -> 50%. If the percentage were
    // computed against acme's own subtotal (2h) instead of the week total,
    // this would wrongly read 100%.
    const { client } = shareByTag(entries, NOW);
    const acme = client.find((c) => c.tag === "acme")!;
    expect(acme.percent).toBe(50);
    const beta = client.find((c) => c.tag === "beta")!;
    expect(beta.percent).toBe(25);
  });

  it("round-half-up, not the default banker's/other rounding a naive Math.round could produce differently", () => {
    // 1 of 3 hours = 33.333...% -> rounds to 33. 2 of 3 = 66.666...% -> 67.
    const entries = [
      dayEntry("a", "A", "acme", null, "2026-08-18T16:00:00.000Z", "2026-08-18T17:00:00.000Z"),
      dayEntry("b", "B", "beta", null, "2026-08-19T16:00:00.000Z", "2026-08-19T18:00:00.000Z"),
    ];
    const { client } = shareByTag(entries, NOW);
    expect(client.find((c) => c.tag === "acme")!.percent).toBe(33);
    expect(client.find((c) => c.tag === "beta")!.percent).toBe(67);
  });

  it("an entry with client but no project appears only in the client list, and vice versa", () => {
    const entries = [
      dayEntry("a", "A", "acme", null, "2026-08-18T16:00:00.000Z", "2026-08-18T17:00:00.000Z"),
      dayEntry("b", "B", null, "rollout", "2026-08-19T16:00:00.000Z", "2026-08-19T17:00:00.000Z"),
    ];
    const { client, project } = shareByTag(entries, NOW);
    expect(client.map((c) => c.tag)).toEqual(["acme"]);
    expect(project.map((p) => p.tag)).toEqual(["rollout"]);
  });

  it("an entirely untagged week returns empty client/project lists, not NaN percentages", () => {
    const entries = [dayEntry("a", "A", null, null, "2026-08-18T16:00:00.000Z", "2026-08-18T17:00:00.000Z")];
    const { client, project } = shareByTag(entries, NOW);
    expect(client).toEqual([]);
    expect(project).toEqual([]);
  });

  it("a zero-entry week returns empty lists without dividing by zero", () => {
    const { client, project } = shareByTag([], NOW);
    expect(client).toEqual([]);
    expect(project).toEqual([]);
  });

  it("sorts descending by duration", () => {
    const entries = [
      dayEntry("a", "A", "small", null, "2026-08-18T16:00:00.000Z", "2026-08-18T16:30:00.000Z"),
      dayEntry("b", "B", "big", null, "2026-08-19T16:00:00.000Z", "2026-08-19T19:00:00.000Z"),
    ];
    const { client } = shareByTag(entries, NOW);
    expect(client.map((c) => c.tag)).toEqual(["big", "small"]);
  });
});

describe("biggestTasks", () => {
  it("groups by the EXACT (name, client, project) tuple — same name, different client, are DIFFERENT rows", () => {
    const entries = [
      dayEntry("a", "Acme onboarding", "acme", "rollout", "2026-08-18T16:00:00.000Z", "2026-08-18T18:00:00.000Z"), // 2h
      dayEntry("b", "Acme onboarding", "beta", "rollout", "2026-08-19T16:00:00.000Z", "2026-08-19T17:00:00.000Z"), // 1h, different client
    ];
    const tasks = biggestTasks(entries, NOW);
    expect(tasks).toHaveLength(2);
    const acmeRow = tasks.find((t) => t.client === "acme")!;
    const betaRow = tasks.find((t) => t.client === "beta")!;
    expect(acmeRow.seconds).toBe(2 * 3600);
    expect(betaRow.seconds).toBe(3600);
  });

  it("sums duration across multiple entries sharing the exact same tuple, across different days", () => {
    const entries = [
      dayEntry("a", "Acme onboarding", "acme", "rollout", "2026-08-18T16:00:00.000Z", "2026-08-18T20:00:00.000Z"), // 4h
      dayEntry("b", "Acme onboarding", "acme", "rollout", "2026-08-19T16:00:00.000Z", "2026-08-19T21:15:00.000Z"), // 5h15m
    ];
    const tasks = biggestTasks(entries, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.seconds).toBe(9 * 3600 + 15 * 60); // 9h15m
  });

  it("excludes entries with no name (auto-named) — a task has a name, matching TimerEngine.recentTaskNames's own precedent", () => {
    const entries = [
      dayEntry("a", null, null, null, "2026-08-18T16:00:00.000Z", "2026-08-18T20:00:00.000Z"),
      dayEntry("b", "Named", "acme", null, "2026-08-19T16:00:00.000Z", "2026-08-19T17:00:00.000Z"),
    ];
    const tasks = biggestTasks(entries, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.name).toBe("Named");
  });

  it("caps at top 5 by summed duration, dropping the rest", () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      dayEntry(
        `t${i}`,
        `Task ${i}`,
        null,
        null,
        "2026-08-18T16:00:00.000Z",
        new Date(new Date("2026-08-18T16:00:00.000Z").getTime() + (i + 1) * 3600_000).toISOString(),
      ),
    );
    const tasks = biggestTasks(entries, NOW);
    expect(tasks).toHaveLength(5);
    // Task 6 (7h) is the biggest, Task 0 (1h) is the smallest and dropped.
    expect(tasks.map((t) => t.name)).toEqual(["Task 6", "Task 5", "Task 4", "Task 3", "Task 2"]);
  });

  it("a custom limit is respected", () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      dayEntry(`t${i}`, `Task ${i}`, null, null, "2026-08-18T16:00:00.000Z", "2026-08-18T17:00:00.000Z"),
    );
    expect(biggestTasks(entries, NOW, 2)).toHaveLength(2);
  });
});
