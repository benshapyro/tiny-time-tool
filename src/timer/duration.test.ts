import { describe, expect, it } from "vitest";
import { segmentDurationSeconds, totalDurationSeconds } from "./duration";
import type { Segment } from "./types";

describe("duration", () => {
  it("computes a closed segment's duration from its own start/end, ignoring `now`", () => {
    const segment: Segment = {
      id: "s1",
      entryId: "e1",
      startedAt: "2026-08-21T10:00:00.000Z",
      endedAt: "2026-08-21T10:20:00.000Z",
    };
    expect(segmentDurationSeconds(segment, new Date("2026-08-21T23:00:00.000Z"))).toBe(20 * 60);
  });

  it("counts an open segment (endedAt: null) to `now` from the injected clock", () => {
    const segment: Segment = {
      id: "s1",
      entryId: "e1",
      startedAt: "2026-08-21T10:00:00.000Z",
      endedAt: null,
    };
    const now = new Date("2026-08-21T10:07:30.000Z");
    expect(segmentDurationSeconds(segment, now)).toBe(7 * 60 + 30);
  });

  it("sums the pinned fixture sequence: start 10:00, pause 10:20, resume 10:30, stop 10:45 -> 35m across two segments", () => {
    const segments: Segment[] = [
      {
        id: "s1",
        entryId: "e1",
        startedAt: "2026-08-21T10:00:00.000Z",
        endedAt: "2026-08-21T10:20:00.000Z",
      },
      {
        id: "s2",
        entryId: "e1",
        startedAt: "2026-08-21T10:30:00.000Z",
        endedAt: "2026-08-21T10:45:00.000Z",
      },
    ];
    expect(totalDurationSeconds(segments, new Date("2026-08-21T11:00:00.000Z"))).toBe(35 * 60);
  });

  it("sums a mix of closed segments and one open segment counted to `now`", () => {
    const segments: Segment[] = [
      {
        id: "s1",
        entryId: "e1",
        startedAt: "2026-08-21T10:00:00.000Z",
        endedAt: "2026-08-21T10:20:00.000Z",
      },
      {
        id: "s2",
        entryId: "e1",
        startedAt: "2026-08-21T10:30:00.000Z",
        endedAt: null,
      },
    ];
    const now = new Date("2026-08-21T10:40:00.000Z");
    expect(totalDurationSeconds(segments, now)).toBe(20 * 60 + 10 * 60);
  });
});
