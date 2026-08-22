import { describe, expect, it } from "vitest";
import { dayKeyToDate, entryDayKey, localDayKey } from "./dayAttribution";

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

// S6: the Log tab navigates by day key and needs to render that key as a
// date (the long-date header). `dayKeyToDate` is the inverse of
// `localDayKey` — round-tripping through it must never shift the day.
describe("dayKeyToDate (S6: the Log tab's date-nav needs the inverse of localDayKey)", () => {
  it("round-trips through localDayKey for an arbitrary local date", () => {
    const original = new Date(2026, 7, 20, 0, 0, 0);
    expect(dayKeyToDate(localDayKey(original))).toEqual(original);
  });

  it("parses single-digit months and days back correctly (not shifted by UTC parsing)", () => {
    expect(dayKeyToDate("2026-01-05")).toEqual(new Date(2026, 0, 5));
  });

  it("never uses UTC-string parsing (`new Date(dayKey)`), which would shift the day in negative-UTC-offset zones", () => {
    // A UTC-string parse of "2026-08-20" yields UTC midnight; converted back
    // to a local Date in a negative-offset zone that would print as Aug 19.
    // The correct construction is always local-component, so date and month
    // must match the key verbatim, whatever the machine's own timezone is.
    const date = dayKeyToDate("2026-08-20");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(20);
  });
});
