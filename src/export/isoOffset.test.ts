// S10: `first_start`/`last_end`'s pinned format — BUILD_SPEC: "local-timezone
// ISO8601 with offset (e.g. `2026-08-21T09:00:00-04:00`)". This is the ONE
// sabotage-drill target for "the ISO offset" rule named in the coordinator's
// brief. Relies on the TZ pin (`vitest.setup.ts`/`vitest.config.ts`,
// verified by `timezonePin.test.ts`) for a deterministic `-07:00`.

import { describe, expect, it } from "vitest";
import { toLocalIsoWithOffset } from "./isoOffset";

describe("toLocalIsoWithOffset", () => {
  it("matches the pinned fixture shape exactly (2026-08-21T09:00:00-07:00)", () => {
    // 09:00 PDT == 16:00 UTC.
    expect(toLocalIsoWithOffset(new Date("2026-08-21T16:00:00.000Z"))).toBe("2026-08-21T09:00:00-07:00");
  });

  it("zero-pads every field — a single-digit hour/minute/second must not collapse the width", () => {
    // 08:05:03 PDT == 15:05:03 UTC.
    expect(toLocalIsoWithOffset(new Date("2026-08-22T15:05:03.000Z"))).toBe("2026-08-22T08:05:03-07:00");
  });

  it("the offset sign and digits are literally '-07:00', not '-7:0' or '+07:00'", () => {
    const iso = toLocalIsoWithOffset(new Date("2026-08-21T18:00:00.000Z"));
    expect(iso.slice(-6)).toBe("-07:00");
  });
});
