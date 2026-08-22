// S2: entry/segment model. Verbatim from BUILD_SPEC's "Pinned interfaces"
// block — do not invent variants; parallel slices depend on this exact
// shape. Duration is never stored: it is always derived as the sum of a
// entry's segments (see duration.ts). `name`/`client`/`project` stay `null`
// in storage when unset — the localized "date · start–end" auto-name is a
// *display*-time concern (later slices), never baked in here.

/** A tracked task. One entry can have many segments (pause/resume splits
 * it into more than one). */
export interface TimeEntry {
  id: string;
  name: string | null;
  client: string | null;
  project: string | null;
  /** ISO8601, UTC (`Date#toISOString()`). */
  createdAt: string;
}

/** A single contiguous run of time within an entry. `endedAt: null` means
 * the segment is still open (the entry is currently running). */
export interface Segment {
  id: string;
  entryId: string;
  /** ISO8601, UTC. */
  startedAt: string;
  /** ISO8601, UTC, or `null` while the segment is open. */
  endedAt: string | null;
}
