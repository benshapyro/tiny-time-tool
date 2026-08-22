// S6: business logic for the Dashboard's Log tab (BUILD_SPEC S6 row).
// Mirrors `PopoverController` — the closest existing analogue — but shows
// one day at a time (with navigation) instead of always "today", and shows
// static start/end times, duration, and tags per entry instead of a live-
// ticking header. There is no live per-second tick here: the popover
// already owns "the glance surface"; the Log is a day-at-a-time record,
// correct as of its last `refresh()`, not a second display of the same
// live clock.
//
// Reuses rather than reinvents: `TimerEngine.entriesForDay` for the day's
// rows (day attribution rule lives there, once); `formatEntryDisplayName`
// for null-name entries; `formatDurationHM` for each entry's and the day's
// total duration; `formatDisplayTime` for locale-aware start/end times;
// `formatAccelerator` for the empty-state teach line, exactly like the
// popover's (S5 F6 finding: never render the raw `CmdOrCtrl` token).
//
// S7 (BUILD_SPEC S7 row: "Full editing in Log") layers editing on top of
// the read-only S6 view: rename, edit start/stop times, edit tags, delete
// with undo — any day, and live on the running entry except for its end
// time. The SQLite-level primitives (`updateSegmentTimes`, `deleteEntry`,
// `restoreEntry`, overlap/range/running-end validation) live on
// `TimerEngine`, not here — this controller's job is translating between
// that engine surface and `LogState`: turning a thrown `OverlapError` into
// a designed, localized `LogState.editError` instead of an exception
// reaching the caller, and turning a delete into a `pendingUndo` snapshot
// the UI can offer to restore.
//
// Single-segment vs multi-segment edits: the Log renders one row per entry
// with a combined start/end (first segment's start, last segment's end —
// same as S6 already did for display). S7's edit form edits exactly those
// two things. For the overwhelmingly common case (one segment), start and
// end are applied to that ONE segment in a single `updateSegmentTimes`
// call — load-bearing, not stylistic: applying them as two separate calls
// could reject a legitimate "shift the whole entry later" edit at the
// intermediate step (new start temporarily past the OLD end) even though
// the final range is valid. For a multi-segment (paused/resumed) entry,
// start goes to the first segment and end to the last — the segments
// between them are left untouched; this slice does not expose editing the
// internal pause/resume boundaries.
//
// Cross-module obligation, same lesson as S6's own module comment and S5's
// review finding before it ("ask what else must observe that change"): an
// edit here can change the CURRENTLY RUNNING entry's start time, which
// changes what the tray/popover should show. `onEngineMutated` is the seam
// — fired after every successful saveEdit/deleteEntry/undoDelete (never
// after a rejected one, since nothing changed) — and `bootstrap.ts` wires
// it to `popover.refresh()`, which already re-syncs the tray via its own
// `onTrayStateChange`. The quick-entry panel does NOT need this seam: its
// only state is an in-progress, uncommitted text buffer local to whatever
// entry is being named right now, never a read of historical data, so a
// Log edit to some other (or even the same, already-committed) entry has
// nothing in the panel to invalidate.

import type { Locale } from "../i18n";
import { formatDisplayTime, interpolate, t } from "../i18n";
import { currentAcceleratorPlatform, formatAccelerator } from "../shortcuts/formatAccelerator";
import { localDayKey } from "../timer/dayAttribution";
import { totalDurationSeconds } from "../timer/duration";
import { formatEntryDisplayName } from "../timer/entryDisplayName";
import { formatDurationHM } from "../timer/formatDuration";
import {
  InvalidRangeError,
  OverlapError,
  RunningSegmentEndNotEditableError,
  type TimerEngine,
} from "../timer/timerEngine";
import type { Segment, TimeEntry } from "../timer/types";

export interface LogEntryView {
  id: string;
  /** Display name — the entry's own name, or the localized auto-name. */
  name: string;
  /** The entry's OWN name field (`null` for an auto-named entry) — what an
   * edit form must pre-fill, since pre-filling the computed auto-name text
   * would turn a null-name entry into a literally-named one on save. */
  rawName: string | null;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  client: string | null;
  project: string | null;
  /** True for the one entry (if any, if the viewed day is today) the
   * engine is currently tracking (running or paused) — BUILD_SPEC: its end
   * time is not editable until paused or stopped. */
  isRunning: boolean;
  /** Raw ISO timestamps — the edit form's pre-fill material. `endIso` is
   * `null` exactly when `isRunning` is true (the last segment is still
   * open): there is no end timestamp to edit, so there is nothing here for
   * an end-time control to be built from at all. */
  startIso: string;
  endIso: string | null;
}

export interface LogEditError {
  entryId: string;
  code: "overlap" | "invalidRange" | "runningEndNotEditable";
  /** Localized, designed message text — never a raw exception string. */
  message: string;
}

export interface PendingUndo {
  entryId: string;
  /** The deleted entry's display name, snapshotted at delete time, for the
   * undo toast's text. */
  label: string;
}

export interface LogState {
  /** `YYYY-MM-DD`, local — the day currently being viewed. */
  dayKey: string;
  isToday: boolean;
  /** Whether "next day" would still land on or before today. Forward
   * navigation is bounded at today — see `goToNextDay`'s doc comment for
   * why. Backward navigation is unbounded (reaches any past day). */
  canGoNext: boolean;
  entries: LogEntryView[];
  totalLabel: string;
  /** Set only when there are no entries for the viewed day — the designed
   * empty state naming the primary shortcut (Design principle 6: "the
   * empty log teaches the shortcut"). `null` whenever any entry exists. */
  emptyStateTeachLine: string | null;
  /** The one entry currently in edit mode, if any. Only one at a time —
   * beginning a new edit implicitly leaves any other. */
  editingEntryId: string | null;
  /** The designed inline error for whichever entry a rejected edit was
   * attempted against — `null` whenever no edit has been rejected (or a
   * later edit succeeded/was cancelled, clearing it). */
  editError: LogEditError | null;
  /** Set immediately after a delete, offering undo; `null` otherwise. Only
   * one pending delete is remembered at a time — starting a second delete
   * before dismissing/undoing the first silently replaces it, a deliberate
   * scope decision (see `deleteEntry`'s doc comment). */
  pendingUndo: PendingUndo | null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export interface LogControllerOptions {
  engine: TimerEngine;
  locale: Locale;
  /** The primary shortcut's current accelerator string (e.g.
   * `"CmdOrCtrl+Shift+Space"`), for the empty-state teach line — same seam
   * as `PopoverControllerOptions.primaryAccelerator`. */
  primaryAccelerator: string;
  clock?: () => Date;
  onStateChange?: (state: LogState) => void;
  /** S7: fired after every edit/delete/undo that actually mutated the
   * engine (never after a rejected one) — see the module doc comment's
   * cross-module obligation section. `bootstrap.ts` wires this to
   * `popover.refresh()` in the real app. */
  onEngineMutated?: () => void | Promise<void>;
}

export class LogController {
  readonly #engine: TimerEngine;
  #locale: Locale;
  readonly #primaryAccelerator: string;
  readonly #clock: () => Date;
  readonly #onStateChange?: (state: LogState) => void;
  readonly #onEngineMutated?: () => void | Promise<void>;
  #viewedDate: Date;
  /** True while the view should track "today" as the clock moves, rather
   * than staying pinned to a fixed date the user navigated to. */
  #followsToday: boolean;
  #state: LogState;
  /** The last `refresh()`'s segments, keyed by entry id — `saveEdit` needs
   * the first/last segment ids to know which row(s) to write to, and
   * re-querying them from the engine on every save would be a second,
   * potentially-stale source of truth for data `refresh()` already read. */
  #segmentsByEntry: Map<string, Segment[]>;
  /** The full entry+segments row a pending delete could restore — kept
   * separately from the public `LogState.pendingUndo` (which exposes only
   * the display label a toast needs), so the raw row data isn't pushed out
   * to every `onStateChange` subscriber. */
  #pendingUndoSnapshot: { entry: TimeEntry; segments: Segment[] } | null;

  constructor(options: LogControllerOptions) {
    this.#engine = options.engine;
    this.#locale = options.locale;
    this.#primaryAccelerator = options.primaryAccelerator;
    this.#clock = options.clock ?? (() => new Date());
    this.#onStateChange = options.onStateChange;
    this.#onEngineMutated = options.onEngineMutated;
    this.#viewedDate = startOfDay(this.#clock());
    this.#followsToday = true;
    this.#segmentsByEntry = new Map();
    this.#pendingUndoSnapshot = null;
    this.#state = {
      dayKey: localDayKey(this.#viewedDate),
      isToday: true,
      canGoNext: false,
      entries: [],
      totalLabel: formatDurationHM(0),
      emptyStateTeachLine: null,
      editingEntryId: null,
      editError: null,
      pendingUndo: null,
    };
  }

  get state(): LogState {
    return this.#state;
  }

  /** S12 review fix: the live-locale seam — mirrors `ReminderController.
   * setMinutes()`'s "persistence and live behaviour are separate" split.
   * Every locale-baked field on `LogState` (entry display names, the
   * empty-state teach line, edit-error messages) was computed under the
   * OLD locale by the last `refresh()`/`saveEdit()` call — this only
   * updates which locale FUTURE computations use; the caller (`bootstrap.
   * ts`'s "setLanguage" wiring) is responsible for calling `refresh()`
   * afterward to re-push the already-open Log tab's current view under the
   * new locale immediately. */
  setLocale(locale: Locale): void {
    this.#locale = locale;
  }

  /** Recomputes the full view for whichever day is currently being viewed.
   * Call on open, after navigating (the nav methods below already do
   * this), and whenever another surface mutates the shared engine while
   * the Dashboard is open — see the module doc comment. Leaves
   * `editingEntryId`/`editError`/`pendingUndo` untouched — those are UI-mode
   * state this method has no opinion on; the methods below manage them. */
  async refresh(): Promise<void> {
    const now = this.#clock();
    const todayKey = localDayKey(now);
    // Review finding on S6: `#viewedDate` was pinned once at construction, so
    // a Dashboard left open across midnight kept repainting YESTERDAY — a
    // task started after midnight simply would not appear, and the only
    // recovery was clicking "Today". The Dashboard is the app's main window,
    // so staying open overnight is the normal case, not an edge case.
    if (this.#followsToday) {
      this.#viewedDate = startOfDay(now);
    }
    const dayKey = localDayKey(this.#viewedDate);
    const dayEntries = await this.#engine.entriesForDay(dayKey);
    const currentEntryId = this.#engine.currentEntryId;
    const timerStatus = this.#engine.state;

    this.#segmentsByEntry = new Map(dayEntries.map(({ entry, segments }) => [entry.id, segments]));

    const entries: LogEntryView[] = dayEntries.map(({ entry, segments }) => {
      const first = segments[0];
      const last = segments[segments.length - 1];
      const start = first ? new Date(first.startedAt) : now;
      const lastIsOpen = !last || last.endedAt === null;
      const end = lastIsOpen ? now : new Date(last.endedAt as string);
      const isRunning = entry.id === currentEntryId && timerStatus !== "idle" && lastIsOpen;
      return {
        id: entry.id,
        name: formatEntryDisplayName(entry, segments, this.#locale, now),
        rawName: entry.name,
        startLabel: formatDisplayTime(this.#locale, start),
        endLabel: formatDisplayTime(this.#locale, end),
        durationLabel: formatDurationHM(totalDurationSeconds(segments, now)),
        client: entry.client,
        project: entry.project,
        isRunning,
        startIso: first ? first.startedAt : now.toISOString(),
        endIso: lastIsOpen ? null : (last.endedAt as string),
      };
    });

    const totalSeconds = dayEntries.reduce((sum, { segments }) => sum + totalDurationSeconds(segments, now), 0);

    const emptyStateTeachLine =
      entries.length === 0
        ? interpolate(t(this.#locale, "log.emptyState"), {
            shortcut: formatAccelerator(this.#primaryAccelerator, currentAcceleratorPlatform(), this.#locale),
          })
        : null;

    this.#setState({
      dayKey,
      isToday: dayKey === todayKey,
      canGoNext: dayKey < todayKey,
      entries,
      totalLabel: formatDurationHM(totalSeconds),
      emptyStateTeachLine,
    });
  }

  /** Jumps back to today from any navigated-away day. */
  async goToday(): Promise<void> {
    this.#viewedDate = startOfDay(this.#clock());
    this.#followsToday = true;
    this.#clearPendingUndo();
    await this.refresh();
  }

  /** Unbounded: reaches any past day via repeated calls. */
  async goToPreviousDay(): Promise<void> {
    const previous = new Date(this.#viewedDate);
    previous.setDate(previous.getDate() - 1);
    this.#viewedDate = previous;
    this.#followsToday = false;
    this.#clearPendingUndo();
    await this.refresh();
  }

  /** Bounded at today. A future day can never have entries — there is
   * nothing to view yet — so letting the user navigate past today would
   * only ever land them on a confusing "press the shortcut to start
   * tracking" empty state for a day that has not happened. Recomputes the
   * candidate day directly against the injected clock rather than trusting
   * `state.canGoNext` (which could be stale if called before any
   * `refresh()`), so the bound holds even then. */
  async goToNextDay(): Promise<void> {
    const todayKey = localDayKey(this.#clock());
    const candidate = new Date(this.#viewedDate);
    candidate.setDate(candidate.getDate() + 1);
    if (localDayKey(candidate) > todayKey) return;
    this.#viewedDate = candidate;
    // Stepping forward ONTO today re-arms the follow behaviour; landing on
    // any earlier day keeps the view pinned where the user put it.
    this.#followsToday = localDayKey(candidate) === todayKey;
    this.#clearPendingUndo();
    await this.refresh();
  }

  /** S7: enters edit mode for one entry, clearing any stale error from a
   * previous edit attempt on a different entry. Only one entry is ever in
   * edit mode — calling this while another is already editing silently
   * switches which one, matching the UI (Log.tsx renders exactly one edit
   * form at a time). */
  beginEdit(entryId: string): void {
    this.#setState({ editingEntryId: entryId, editError: null });
  }

  /** Leaves edit mode without saving. */
  cancelEdit(): void {
    this.#setState({ editingEntryId: null, editError: null });
  }

  /** S7: applies a rename/tag/time edit. `fields.name`/`client`/`project`
   * are always applied (the edit form is one combined set of fields, not
   * independently-submitted pieces); `fields.start` is always applied;
   * `fields.end` is applied only when present — the running entry's edit
   * form has no end control at all, so its `saveEdit` call omits `end`
   * entirely (see `LogEntryView.isRunning`/`endIso`).
   *
   * On success: clears edit mode and any error, refreshes, and notifies
   * `onEngineMutated`. On a rejected edit (`OverlapError`/
   * `InvalidRangeError`/`RunningSegmentEndNotEditableError`): sets the
   * designed `editError` for this entry, LEAVES `editingEntryId` as this
   * entry (so the form and its inline error stay visible together), does
   * NOT refresh (nothing changed), and does NOT notify `onEngineMutated`
   * (same reason). Never rethrows a known validation error to the caller —
   * that is the whole point of turning it into state instead of an
   * exception. An unrecognized error (a genuine bug, not a validation
   * rejection) is NOT swallowed — it rethrows, since silently no-op'ing an
   * unknown failure would hide it. */
  async saveEdit(
    entryId: string,
    fields: { name: string | null; client: string | null; project: string | null; start: string; end?: string },
  ): Promise<void> {
    const segments = this.#segmentsByEntry.get(entryId) ?? [];
    const first = segments[0];
    const last = segments[segments.length - 1];

    try {
      if (first && last && first.id === last.id) {
        // Single segment: start+end applied together in ONE call — see the
        // module doc comment for why this must be atomic, not sequential.
        const segFields: { startedAt?: string; endedAt?: string } = { startedAt: fields.start };
        if (fields.end !== undefined) segFields.endedAt = fields.end;
        await this.#engine.updateSegmentTimes(first.id, segFields);
      } else {
        if (first) {
          await this.#engine.updateSegmentTimes(first.id, { startedAt: fields.start });
        }
        if (last && fields.end !== undefined) {
          await this.#engine.updateSegmentTimes(last.id, { endedAt: fields.end });
        }
      }

      await this.#engine.setEntryFields(entryId, {
        name: fields.name,
        client: fields.client,
        project: fields.project,
      });

      this.#setState({ editingEntryId: null, editError: null });
      await this.refresh();
      await this.#onEngineMutated?.();
    } catch (error) {
      this.#setState({ editError: this.#toEditError(entryId, error) });
    }
  }

  /** S7: deletes an entry, snapshotting it first so `undoDelete` can bring
   * it back byte-identical. Refuses (rethrows) for the currently running
   * entry — `TimerEngine.deleteEntry`'s guard; the Log UI disables Delete
   * for it, this is defense-in-depth, not a UI-reachable path in the real
   * app. Starting a second delete while a first is still offering undo
   * silently replaces the pending snapshot — a deliberate scope decision:
   * only one delete's worth of undo material is kept, matching how the UI
   * shows only one toast at a time. */
  async deleteEntry(entryId: string): Promise<void> {
    const entry = await this.#engine.entry(entryId);
    if (!entry) return; // already gone — nothing to snapshot or delete
    const segments = await this.#engine.segmentsFor(entryId);
    const label = formatEntryDisplayName(entry, segments, this.#locale, this.#clock());

    await this.#engine.deleteEntry(entryId);

    this.#pendingUndoSnapshot = { entry, segments };
    this.#setState({ editingEntryId: null, editError: null, pendingUndo: { entryId, label } });
    await this.refresh();
    await this.#onEngineMutated?.();
  }

  /** S7: restores the most recently deleted entry from its snapshot — same
   * ids, same timestamps (`TimerEngine.restoreEntry`), so the row is
   * byte-identical to the one that was deleted. No-op if nothing is
   * pending (e.g. called twice, or after `dismissUndo`). */
  async undoDelete(): Promise<void> {
    if (!this.#pendingUndoSnapshot) return;
    const { entry, segments } = this.#pendingUndoSnapshot;
    await this.#engine.restoreEntry(entry, segments);
    this.#pendingUndoSnapshot = null;
    this.#setState({ pendingUndo: null });
    await this.refresh();
    await this.#onEngineMutated?.();
  }

  /** Dismisses the undo toast without restoring the row — the delete
   * stands. */
  dismissUndo(): void {
    this.#clearPendingUndo();
  }

  #clearPendingUndo(): void {
    if (this.#pendingUndoSnapshot === null && this.#state.pendingUndo === null) return;
    this.#pendingUndoSnapshot = null;
    this.#setState({ pendingUndo: null });
  }

  #toEditError(entryId: string, error: unknown): LogEditError {
    if (error instanceof OverlapError) {
      return { entryId, code: "overlap", message: t(this.#locale, "log.edit.error.overlap") };
    }
    if (error instanceof InvalidRangeError) {
      return { entryId, code: "invalidRange", message: t(this.#locale, "log.edit.error.invalidRange") };
    }
    if (error instanceof RunningSegmentEndNotEditableError) {
      return {
        entryId,
        code: "runningEndNotEditable",
        message: t(this.#locale, "log.edit.error.runningEndNotEditable"),
      };
    }
    // Not a recognized validation rejection — a real bug. Rethrow rather
    // than mask it as a generic inline error (CLAUDE.md: never swallow an
    // unrecognized failure).
    throw error;
  }

  #setState(patch: Partial<LogState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.#state);
  }
}
