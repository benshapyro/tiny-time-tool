// S5: day-total / duration display format — "Xh Ym" with minutes zero-
// padded to two digits when hours are present, and a bare unpadded "Ym"
// when hours are zero (BUILD_SPEC Copy-for-AI pinned examples: "1h 30m",
// "45m"; S5's own acceptance fixture pins "2h 05m", which is where the
// zero-padding requirement comes from — "5m" alone would not match).
// Deliberately distinct from the ticking `M:SS`/`H:MM:SS` format in
// trayTitle.ts (reused there, not duplicated here): this is the "day total"
// shape, used by S5's popover today and later by Log (S6), Insights (S11),
// and the exports (S10) wherever a *summed* duration is displayed rather
// than a live-ticking one.
//
// Rounds to the nearest whole minute, half-up — the same rounding rule
// BUILD_SPEC pins for CSV's `duration_minutes`, applied here too so a given
// number of seconds never displays two different ways across surfaces.

export function formatDurationHM(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60 + 0.5);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}
