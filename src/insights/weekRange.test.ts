// S11: `currentWeekRange` — the one "this week" definition every Insights
// view shares (see weekRange.ts's module doc comment for the Monday-start,
// local-calendar rationale). TZ is pinned to America/Los_Angeles for the
// whole suite (vitest.config.ts) — every date below is constructed via
// local `Date` components (`new Date(y, m, d)`), never a UTC string, so
// these assertions exercise the pin rather than being accidentally
// TZ-independent.

import { describe, expect, it } from "vitest";
import { currentWeekRange } from "./weekRange";

describe("currentWeekRange", () => {
  it("a Tuesday resolves to that week's Monday..Sunday (2026-08-18 -> 2026-08-17..2026-08-23)", () => {
    const range = currentWeekRange(new Date(2026, 7, 18, 14, 30));
    expect(range.startDayKey).toBe("2026-08-17");
    expect(range.endDayKeyInclusive).toBe("2026-08-23");
    expect(range.dayKeys).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });

  it("Monday itself (the week's own start) resolves to the same week as any other day in it", () => {
    const range = currentWeekRange(new Date(2026, 7, 17, 0, 0, 1));
    expect(range.startDayKey).toBe("2026-08-17");
    expect(range.endDayKeyInclusive).toBe("2026-08-23");
  });

  it("Sunday (the week's own end, late in the day) resolves to the same week", () => {
    const range = currentWeekRange(new Date(2026, 7, 23, 23, 59, 59));
    expect(range.startDayKey).toBe("2026-08-17");
    expect(range.endDayKeyInclusive).toBe("2026-08-23");
  });

  it("a Sunday just before midnight does NOT roll into the next week (calendar-day boundary, not a rolling 7-day window)", () => {
    const sundayNight = currentWeekRange(new Date(2026, 7, 23, 23, 59, 59));
    const mondayMorning = currentWeekRange(new Date(2026, 7, 24, 0, 0, 1));
    expect(sundayNight.startDayKey).toBe("2026-08-17");
    expect(mondayMorning.startDayKey).toBe("2026-08-24");
  });

  it("crosses a month boundary correctly (Sat 2026-08-29 falls in the week of Mon 2026-08-24..Sun 2026-08-30)", () => {
    const range = currentWeekRange(new Date(2026, 7, 29, 12, 0));
    expect(range.startDayKey).toBe("2026-08-24");
    expect(range.endDayKeyInclusive).toBe("2026-08-30");
  });

  it("crosses a year boundary correctly (Fri 2027-01-01 falls in the week of Mon 2026-12-28..Sun 2027-01-03)", () => {
    const range = currentWeekRange(new Date(2027, 0, 1, 9, 0));
    expect(range.startDayKey).toBe("2026-12-28");
    expect(range.endDayKeyInclusive).toBe("2027-01-03");
  });

  it("dayKeys is always exactly 7 entries, Monday first, in ascending order", () => {
    const range = currentWeekRange(new Date(2026, 7, 20, 8, 0));
    expect(range.dayKeys).toHaveLength(7);
    const sorted = [...range.dayKeys].sort();
    expect(range.dayKeys).toEqual(sorted); // already ascending
  });
});
