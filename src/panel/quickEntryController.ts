// S4: the quick-entry panel's business logic (BUILD_SPEC S4 row). Lives in
// TS, decoupled from any real Tauri window, per this project's "business
// logic in TS, Rust stays thin" architecture — `QuickEntryPanel.tsx` is a
// thin renderer of `this.state`, and `bootstrap.ts` wires this into the
// running app via S3's `ShortcutController` seams.
//
// Two ways the panel opens (BUILD_SPEC S4 "the S3/S4 interplay"):
//   - `openForNaming()` — S3's `onPanelOpenRequested`, fires exactly on
//     primary-from-idle. The entry has ALREADY started (tracking begins at
//     the shortcut press, not at Enter) — naming here calls
//     `TimerEngine.setEntryFields` on the current entry, never `start()`.
//   - `openForSwitch()` — the Switch action (popover/reminder, later
//     slices): shows the passive "Will stop: {name} ({elapsed})" notice for
//     the entry about to be replaced; committing stops it as-is and starts
//     a brand new entry from the typed text (Enter *is* the start moment
//     here — there is no earlier shortcut press for the new entry).
// `commitIfOpen()` is the S4 seam for "primary press while the panel is
// open = commit current text (as Enter) then pause": wired to
// `ShortcutController`'s `onBeforePause`, and a no-op when the panel is
// already closed (so it's safe to call unconditionally on every pause).

import type { Locale } from "../i18n";
import { interpolate, t } from "../i18n";
import { formatEntryDisplayName } from "../timer/entryDisplayName";
import type { TimerEngine } from "../timer/timerEngine";
import { formatElapsed } from "../tray/trayTitle";
import { filterAutocomplete } from "./autocomplete";
import { parseQuickEntry } from "./quickEntryGrammar";

export type PanelMode = "closed" | "naming" | "switching";

export interface PanelState {
  mode: PanelMode;
  text: string;
  suggestions: string[];
  /** Set only in "switching" mode — the passive notice naming the entry
   * about to be stopped. */
  notice: string | null;
}

export interface QuickEntryControllerOptions {
  engine: TimerEngine;
  locale: Locale;
  clock?: () => Date;
  /** How many recent names to fetch for autocomplete. Defaults to 50 —
   * generous enough that the 2-char prefix filter has something to work
   * with, small enough to stay a cheap query. */
  recentNamesLimit?: number;
  onStateChange?: (state: PanelState) => void;
}

const CLOSED_STATE: PanelState = { mode: "closed", text: "", suggestions: [], notice: null };

export class QuickEntryController {
  readonly #engine: TimerEngine;
  readonly #locale: Locale;
  readonly #clock: () => Date;
  readonly #recentNamesLimit: number;
  readonly #onStateChange?: (state: PanelState) => void;
  #state: PanelState;
  #recentNames: string[];
  /** The entry the "switching" flow is about to stop — captured at
   * `openForSwitch()` time so a slow-typing user can't race a concurrent
   * state change on `TimerEngine.currentEntryId`. */
  #switchTargetEntryId: string | null;

  constructor(options: QuickEntryControllerOptions) {
    this.#engine = options.engine;
    this.#locale = options.locale;
    this.#clock = options.clock ?? (() => new Date());
    this.#recentNamesLimit = options.recentNamesLimit ?? 50;
    this.#onStateChange = options.onStateChange;
    this.#state = CLOSED_STATE;
    this.#recentNames = [];
    this.#switchTargetEntryId = null;
  }

  get state(): PanelState {
    return this.#state;
  }

  /** S3's `onPanelOpenRequested` seam: primary-from-idle. The entry has
   * already started (elsewhere, at the shortcut press) — this only opens
   * the panel for naming it. */
  openForNaming(): void {
    this.#switchTargetEntryId = null;
    this.#setState({ mode: "naming", text: "", suggestions: [], notice: null });
    void this.loadSuggestions();
  }

  /** The Switch action: shows the passive notice for whichever entry is
   * currently running/paused, then lets the user type the next task. */
  async openForSwitch(): Promise<void> {
    const entryId = this.#engine.currentEntryId;
    if (!entryId) return; // nothing running to switch away from — no-op
    this.#switchTargetEntryId = entryId;

    const entry = await this.#engine.entry(entryId);
    const segments = await this.#engine.segmentsFor(entryId);
    const elapsed = await this.#engine.durationSeconds(entryId);
    const displayName = formatEntryDisplayName(entry ?? { name: null }, segments, this.#locale, this.#clock());
    const notice = interpolate(t(this.#locale, "panel.switchNotice"), {
      name: displayName,
      elapsed: formatElapsed(elapsed),
    });

    this.#setState({ mode: "switching", text: "", suggestions: [], notice });
    void this.loadSuggestions();
  }

  /** Refreshes the autocomplete candidate pool from the engine. Called
   * automatically on open; exposed so tests (and the panel, if it wants to
   * refresh mid-session) can await it explicitly rather than racing the
   * fire-and-forget call inside `openFor*`. */
  async loadSuggestions(): Promise<void> {
    this.#recentNames = await this.#engine.recentTaskNames(this.#recentNamesLimit);
    this.#setState({ suggestions: filterAutocomplete(this.#recentNames, this.#state.text) });
  }

  updateText(text: string): void {
    this.#setState({ text, suggestions: filterAutocomplete(this.#recentNames, text) });
  }

  /** Enter. Behavior depends on which flow opened the panel — see the
   * module doc comment. A no-op (resolves immediately) if the panel is
   * already closed. */
  async commit(): Promise<void> {
    if (this.#state.mode === "closed") return;

    const parsed = parseQuickEntry(this.#state.text);

    if (this.#state.mode === "naming") {
      const entryId = this.#engine.currentEntryId;
      if (entryId) {
        await this.#engine.setEntryFields(entryId, parsed);
      }
    } else {
      // "switching": stop the outgoing entry as-is (no renaming it), start
      // a fresh one from what was just typed. Tracking for the new entry
      // begins now — there is no earlier shortcut press to inherit, unlike
      // the naming flow.
      if (this.#switchTargetEntryId && this.#engine.currentEntryId === this.#switchTargetEntryId) {
        await this.#engine.stop();
      }
      await this.#engine.start(parsed);
    }

    this.#switchTargetEntryId = null;
    this.#setState(CLOSED_STATE);
  }

  /** S4 seam for `ShortcutController.onBeforePause`: commits whatever is
   * typed if the panel happens to be open; a pure no-op if it's closed.
   * Safe to call unconditionally on every primary-press pause. */
  async commitIfOpen(): Promise<void> {
    if (this.#state.mode === "closed") return;
    await this.commit();
  }

  /** Esc / click-away (wired by later slices — S5's popover, primarily).
   * Discards typed text without committing anything. */
  close(): void {
    this.#switchTargetEntryId = null;
    this.#setState(CLOSED_STATE);
  }

  #setState(patch: Partial<PanelState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.#state);
  }
}
