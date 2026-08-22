// S5: day-total / duration display format ("Xh Ym") — the popover's day
// total, distinct from the pinned ticking `M:SS`/`H:MM:SS` format in
// trayTitle.ts (BUILD_SPEC S5 acceptance: seeded fixture day renders 3
// entries + correct total "2h 05m"). Also matches the Copy-for-AI pinned
// examples ("1h 30m", "45m") so the same rule serves both surfaces.

import { describe, expect, it } from "vitest";
import { formatDurationHM, roundHalfUp } from "./formatDuration";

describe("formatDurationHM", () => {
  it("pads minutes to two digits when hours are present (the S5 fixture: 2h 05m)", () => {
    expect(formatDurationHM(125 * 60)).toBe("2h 05m");
  });

  it("matches the Copy-for-AI pinned examples", () => {
    expect(formatDurationHM(90 * 60)).toBe("1h 30m");
    expect(formatDurationHM(45 * 60)).toBe("45m");
  });

  it("zero hours renders as bare, unpadded Ym per BUILD_SPEC ('zero hours as Ym')", () => {
    expect(formatDurationHM(5 * 60)).toBe("5m");
    expect(formatDurationHM(0)).toBe("0m");
  });

  it("rounds to the nearest whole minute, half-up", () => {
    expect(formatDurationHM(30)).toBe("1m"); // 0.5m rounds up
    expect(formatDurationHM(29)).toBe("0m");
  });

  it("rolls minutes over into hours at 60", () => {
    expect(formatDurationHM(60 * 60)).toBe("1h 00m");
  });
});

// S11: `roundHalfUp` is the generic rule `roundMinutesHalfUp` above is built
// from — Insights' tag-share percentages reuse this SAME function (applied
// to a ratio*100, not seconds/60) rather than a second rounding rule.
describe("roundHalfUp", () => {
  it("rounds exactly .5 up, not to even (banker's rounding would round 61.5 down to 62 too by luck — 60.5 is the real distinguishing case)", () => {
    expect(roundHalfUp(60.5)).toBe(61);
    expect(roundHalfUp(61.5)).toBe(62);
  });

  it("rounds below .5 down", () => {
    expect(roundHalfUp(61.49)).toBe(61);
  });

  it("rounds above .5 up", () => {
    expect(roundHalfUp(61.51)).toBe(62);
  });

  it("passes whole numbers through unchanged", () => {
    expect(roundHalfUp(62)).toBe(62);
    expect(roundHalfUp(0)).toBe(0);
  });
});
