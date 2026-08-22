// S7: pure helpers converting between an ISO timestamp and the `HH:MM`
// value an `<input type="time">` needs (always 24-hour, per the HTML spec,
// regardless of the viewer's locale — this is a form-control concern, not a
// *display* concern, so it deliberately does NOT go through
// `formatDisplayTime`/`formatFixedTime`). Split out and unit-tested on their
// own, same convention as `panelHeight.ts`/`quickEntryGrammar.ts`: pure
// logic a component can stay thin around, exercised without rendering.
//
// `combineDateAndTime` anchors the new time to the REFERENCE timestamp's own
// local calendar day, not the Log's currently-viewed day — load-bearing for
// a rare overnight entry (BUILD_SPEC: an entry starting 23:30 and ending
// 00:45 is attributed to the start day but its end segment genuinely sits on
// the next calendar day). Editing only the end field's time-of-day must not
// silently yank it back onto the start's day.

import { describe, expect, it } from "vitest";
import { combineDateAndTime, toTimeInputValue } from "./editTimeFields";

describe("toTimeInputValue", () => {
  it("extracts local HH:MM, 24-hour, zero-padded", () => {
    expect(toTimeInputValue(new Date(2026, 7, 20, 9, 5).toISOString())).toBe("09:05");
    expect(toTimeInputValue(new Date(2026, 7, 20, 17, 30).toISOString())).toBe("17:30");
    expect(toTimeInputValue(new Date(2026, 7, 20, 0, 0).toISOString())).toBe("00:00");
  });
});

describe("combineDateAndTime", () => {
  it("keeps the reference timestamp's own local calendar day, swaps in the new time", () => {
    const reference = new Date(2026, 7, 20, 9, 0).toISOString();
    const result = combineDateAndTime(reference, "14:45");
    const resultDate = new Date(result);
    expect(resultDate.getFullYear()).toBe(2026);
    expect(resultDate.getMonth()).toBe(7);
    expect(resultDate.getDate()).toBe(20);
    expect(resultDate.getHours()).toBe(14);
    expect(resultDate.getMinutes()).toBe(45);
  });

  it("an overnight end segment (next calendar day) keeps ITS OWN day when only its time-of-day is edited", () => {
    // Start 23:30 on the 20th, end 00:45 on the 21st (BUILD_SPEC's own
    // overnight fixture). Editing the end field's time-of-day to 00:50 must
    // stay anchored to the 21st, not snap back to the 20th.
    const endReference = new Date(2026, 7, 21, 0, 45).toISOString();
    const result = combineDateAndTime(endReference, "00:50");
    const resultDate = new Date(result);
    expect(resultDate.getDate()).toBe(21);
    expect(resultDate.getHours()).toBe(0);
    expect(resultDate.getMinutes()).toBe(50);
  });

  it("round-trips through toTimeInputValue for a range of times", () => {
    const reference = new Date(2026, 7, 20, 13, 7).toISOString();
    for (const hhmm of ["00:00", "09:30", "12:00", "23:59"]) {
      const combined = combineDateAndTime(reference, hhmm);
      expect(toTimeInputValue(combined)).toBe(hhmm);
    }
  });
});
