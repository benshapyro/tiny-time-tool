// S10: BUILD_SPEC "Pinned interfaces" — `first_start`/`last_end` are
// "local-timezone ISO8601 with offset (e.g. `2026-08-21T09:00:00-04:00`)".
// Distinct from `Date#toISOString()` (always UTC, `Z` suffix — the format
// every OTHER timestamp in this app's storage layer uses) and from
// `formatFixedTime` (`../i18n`'s 24-hour time-of-day-only export formatter —
// no date, no offset). This is the one place both the local calendar date
// AND the local UTC offset are rendered together in one string, because
// that's the one field that needs both.
//
// Deliberately reads the LOCAL fields off `Date` (`getFullYear`/`getHours`/
// etc, same "local, not UTC-sliced" reasoning as `dayAttribution.ts`'s
// `localDayKey`) rather than formatting via `Intl.DateTimeFormat` — the
// offset itself has no direct `Intl` accessor without parsing a formatted
// string back apart, and `Date#getTimezoneOffset()` gives it directly.
//
// Determinism note: this reads the PROCESS's local timezone
// (`Date#getTimezoneOffset()`), same as `dayAttribution.ts`. In the real
// app that's genuinely the user's own machine; in tests it's the pinned
// `TZ=America/Los_Angeles` (see `vitest.config.ts`/`vitest.setup.ts`/
// `timezonePin.test.ts`) — WITHOUT that pin this function is still correct,
// but the S10 golden fixtures (written with a fixed `-07:00`) would only
// match on a machine actually running Pacific time.

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function toLocalIsoWithOffset(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  // Date#getTimezoneOffset() returns (UTC minus local) in minutes — positive
  // for timezones WEST of UTC (e.g. PDT: +420). An ISO offset expresses the
  // opposite sign convention (local minus UTC, e.g. PDT: "-07:00") — negate.
  const localMinusUtcMinutes = -date.getTimezoneOffset();
  const sign = localMinusUtcMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(localMinusUtcMinutes);
  const offsetHours = pad(Math.floor(absoluteMinutes / 60));
  const offsetMinutes = pad(absoluteMinutes % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}
