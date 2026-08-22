// S10: proves the TZ pin (`vitest.config.ts`'s `test.env.TZ` +
// `vitest.setup.ts`'s redundant `process.env.TZ` assignment) is ACTUALLY in
// effect for this process, not just configured somewhere. The golden export
// fixtures (`fixtures/golden/export.csv`, `export.json`, `export-variant.*`)
// are hand-authored with a fixed `-07:00` local UTC offset
// (`America/Los_Angeles` in August, PDT) — if a future refactor silently
// drops the pin (e.g. renames the env key, moves it to a config block Vitest
// doesn't apply per-worker), every golden-file test would start comparing
// against whatever offset the machine running the suite happens to be in:
// `-07:00` on a US-Pacific laptop, `+00:00` on a UTC CI runner, `+09:00` on a
// JST one. That failure would look like a code bug in the export formatter,
// not a config regression — this test exists so it fails loudly and exactly
// where the actual cause is, instead.
//
// Asserts BOTH ends of the mechanism: the env var itself (`process.env.TZ`)
// AND its observable effect on `Date`/`Intl` (`getTimezoneOffset()` and a
// real `Intl.DateTimeFormat` resolved timezone) — a passing env var with a
// stale timezone cache (the exact failure mode `vitest.setup.ts`'s comment
// warns about) would still be caught by the second half.

import { describe, expect, it } from "vitest";

describe("TZ pin (America/Los_Angeles)", () => {
  it("is set in process.env", () => {
    expect(process.env.TZ).toBe("America/Los_Angeles");
  });

  it("is actually honoured by Date/Intl, not just set and ignored", () => {
    // August 21 2026 is within US DST (PDT, UTC-7) — getTimezoneOffset()
    // returns UTC-minus-local in minutes, so PDT (local = UTC-7) is +420.
    const august = new Date(2026, 7, 21, 12, 0, 0);
    expect(august.getTimezoneOffset()).toBe(420);

    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles");
  });

  it("a fixed instant renders with the pinned -07:00 offset (the exact fixture invariant)", () => {
    // 2026-08-21T16:00:00Z is 09:00 in PDT (UTC-7) — the S10 golden
    // fixtures' first row's `first_start`.
    const instant = new Date("2026-08-21T16:00:00.000Z");
    const hours = String(instant.getHours()).padStart(2, "0");
    const minutes = String(instant.getMinutes()).padStart(2, "0");
    expect(`${hours}:${minutes}`).toBe("09:00");
  });
});
