// BUILD_SPEC "Pinned interfaces": duration = sum of segments. Never stored
// — always derived, here and everywhere downstream (Log, exports,
// Insights). An open segment (`endedAt: null`) counts to `now`, and `now`
// is always the caller's injected clock, never `Date.now()` directly, so
// this stays deterministic under test.

import type { Segment } from "./types";

export function segmentDurationSeconds(segment: Segment, now: Date): number {
  const startedAtMs = new Date(segment.startedAt).getTime();
  const endedAtMs = segment.endedAt === null ? now.getTime() : new Date(segment.endedAt).getTime();
  return Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000));
}

export function totalDurationSeconds(segments: readonly Segment[], now: Date): number {
  return segments.reduce((sum, segment) => sum + segmentDurationSeconds(segment, now), 0);
}
