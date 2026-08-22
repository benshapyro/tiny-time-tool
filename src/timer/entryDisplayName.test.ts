// BUILD_SPEC S4 pinned acceptance check: "empty-Enter creates a null-name
// entry displaying `Aug 21 · 10:00 AM–10:45 AM` in en-US and
// `21 ago · 10:00–10:45` in es." Auto-name is rendered at display time,
// never stored (BUILD_SPEC Pinned interfaces).
//
// Fixtures are built via the LOCAL Date constructor (`new Date(y, m, d, h,
// min)`), never a hand-typed `Z` ISO string, then round-tripped through
// `.toISOString()` the same way production storage does. That keeps the
// test deterministic on any machine/CI regardless of its timezone offset —
// it always represents "10:00 local wall-clock", which is what the pinned
// fixture strings describe (this project's existing convention, e.g.
// `timerEngine.test.ts`'s overnight fixture).

import { describe, expect, it } from "vitest";
import type { Segment } from "./types";
import { formatEntryDisplayName } from "./entryDisplayName";

function localIso(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m - 1, d, h, min, 0).toISOString();
}

const segment = (startedAt: string, endedAt: string | null): Segment => ({
  id: "seg-1",
  entryId: "entry-1",
  startedAt,
  endedAt,
});

describe("formatEntryDisplayName", () => {
  it("BUILD_SPEC pinned fixture, en-US: 'Aug 21 · 10:00 AM–10:45 AM'", () => {
    const start = localIso(2026, 8, 21, 10, 0);
    const end = localIso(2026, 8, 21, 10, 45);
    const result = formatEntryDisplayName({ name: null }, [segment(start, end)], "en", new Date());
    expect(result).toBe("Aug 21 · 10:00 AM–10:45 AM");
  });

  it("BUILD_SPEC pinned fixture, es: '21 ago · 10:00–10:45'", () => {
    const start = localIso(2026, 8, 21, 10, 0);
    const end = localIso(2026, 8, 21, 10, 45);
    const result = formatEntryDisplayName({ name: null }, [segment(start, end)], "es", new Date());
    expect(result).toBe("21 ago · 10:00–10:45");
  });

  it("a non-null name is returned verbatim — no auto-name computed", () => {
    const start = localIso(2026, 8, 21, 10, 0);
    const result = formatEntryDisplayName(
      { name: "Acme onboarding" },
      [segment(start, null)],
      "en",
      new Date(),
    );
    expect(result).toBe("Acme onboarding");
  });

  it("a still-running null-name entry (open segment) uses `now` as the end time", () => {
    const start = localIso(2026, 8, 21, 10, 0);
    const now = new Date(localIso(2026, 8, 21, 10, 20));
    const result = formatEntryDisplayName({ name: null }, [segment(start, null)], "en", now);
    expect(result).toBe("Aug 21 · 10:00 AM–10:20 AM");
  });

  it("spans multiple segments (paused/resumed): start is the first segment's start, end is the last segment's end", () => {
    const start = localIso(2026, 8, 21, 9, 0);
    const midEnd = localIso(2026, 8, 21, 9, 20);
    const midStart = localIso(2026, 8, 21, 9, 30);
    const end = localIso(2026, 8, 21, 9, 45);
    const result = formatEntryDisplayName(
      { name: null },
      [segment(start, midEnd), segment(midStart, end)],
      "en",
      new Date(),
    );
    expect(result).toBe("Aug 21 · 9:00 AM–9:45 AM");
  });
});
