// S7: pure helpers converting between an ISO timestamp and the `HH:MM`
// value an `<input type="time">` needs — always 24-hour per the HTML spec,
// regardless of the viewer's locale, since this is a form-control concern,
// not a *display* concern (display goes through `formatDisplayTime`/
// `formatFixedTime` in `../i18n`, never this). Kept pure and unit-tested on
// its own (`editTimeFields.test.ts`), same convention as
// `panelHeight.ts`/`quickEntryGrammar.ts`, so `Log.tsx` stays a thin
// renderer around it.

/** Local HH:MM (24-hour, zero-padded) for an ISO timestamp — the value
 * attribute an `<input type="time">` expects. */
export function toTimeInputValue(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Swaps in a new `HH:MM` time-of-day onto `referenceIso`'s OWN local
 * calendar day, returning a new ISO timestamp. Deliberately anchored to the
 * reference's day, not "today" or the Log's currently-viewed day — an
 * entry's end segment can genuinely fall on the day AFTER its start
 * (BUILD_SPEC's own overnight fixture: 23:30 start, 00:45 end, attributed
 * to the start day but the end timestamp itself is on the next calendar
 * day). Editing only the end field's time-of-day must not silently yank it
 * back onto the start's day. */
export function combineDateAndTime(referenceIso: string, hhmm: string): string {
  const reference = new Date(referenceIso);
  const [hours, minutes] = hhmm.split(":").map(Number);
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    hours ?? 0,
    minutes ?? 0,
    0,
    0,
  ).toISOString();
}
