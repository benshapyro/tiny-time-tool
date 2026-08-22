import { describe, expect, it } from "vitest";
import { entryDayKey, localDayKey } from "./dayAttribution";

describe("dayAttribution", () => {
  it("keys a same-day entry to its own calendar day", () => {
    const start = new Date(2026, 7, 21, 9, 0, 0); // Aug 21 2026, local
    expect(entryDayKey(start.toISOString())).toBe(localDayKey(start));
  });

  it("BUILD_SPEC fixture: an entry starting 23:30 belongs to the start day, not the day it ends on", () => {
    const start = new Date(2026, 7, 21, 23, 30, 0);
    const endsNextDay = new Date(2026, 7, 22, 0, 45, 0);

    const startDay = localDayKey(start);
    const endDay = localDayKey(endsNextDay);
    expect(startDay).not.toBe(endDay);

    expect(entryDayKey(start.toISOString())).toBe(startDay);
  });

  it("pads single-digit months and days", () => {
    const jan5 = new Date(2026, 0, 5, 8, 0, 0);
    expect(localDayKey(jan5)).toBe("2026-01-05");
  });
});
