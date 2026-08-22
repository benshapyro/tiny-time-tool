// S10: business logic for the Dashboard's Export section (BUILD_SPEC S10
// row; ST4 "copy my day" / ST5 "CSV/JSON export by date range"). Mirrors
// `LogController`'s architecture — a real `TimerEngine`, clock injected —
// but with its own state shape, since Export's concerns (a copy-to-
// clipboard action, a date range, a download trigger) don't overlap
// LogController's (day navigation, inline editing).
//
// Two independent actions, matching the two different day-scoping rules
// BUILD_SPEC pins for the two export kinds:
//   - Copy-for-AI is always TODAY (`entriesForDay(localDayKey(now))`) — the
//     block's own header is "Time entries for {one date}", and ST4's story
//     is "copy my day" at day's end, not a range picker. No day-nav UI for
//     it; keeping the surface minimal per the coordinator's brief.
//   - CSV/JSON export a `[rangeStart, rangeEnd]` inclusive range
//     (`entriesForRange`), defaulting to today on construction.
//
// Side effects (clipboard write, file download) are injected
// (`copyToClipboard`/`downloadFile`), defaulting to the real DOM
// implementations in `browserClipboard.ts`/`browserDownload.ts` — same
// "inject the browser/IPC edge, unit-test everything behind it" split as
// every other controller in this project.

import { localDayKey } from "../timer/dayAttribution";
import type { TimerEngine } from "../timer/timerEngine";
import { browserClipboardWrite } from "./browserClipboard";
import { browserDownload } from "./browserDownload";
import { buildCopyForAiMarkdown } from "./copyForAi";
import { buildCsv } from "./csvExport";
import { buildExportRows } from "./exportRows";
import { buildJson } from "./jsonExport";

export interface ExportState {
  /** Result of the most recent `copyTodayForAi()` call — `"idle"` until
   * first attempted. */
  copyStatus: "idle" | "copied" | "error";
  /** `YYYY-MM-DD`, inclusive. Both default to today at construction. */
  rangeStart: string;
  rangeEnd: string;
  /** Set when `exportCsv`/`exportJson` is attempted with `rangeStart` after
   * `rangeEnd`; cleared by either range setter. `null` otherwise. */
  rangeError: "invalidOrder" | null;
}

export interface ExportControllerOptions {
  engine: TimerEngine;
  clock?: () => Date;
  copyToClipboard?: (text: string) => Promise<void>;
  downloadFile?: (filename: string, content: string, mimeType: string) => void;
  onStateChange?: (state: ExportState) => void;
}

export class ExportController {
  readonly #engine: TimerEngine;
  readonly #clock: () => Date;
  readonly #copyToClipboard: (text: string) => Promise<void>;
  readonly #downloadFile: (filename: string, content: string, mimeType: string) => void;
  readonly #onStateChange?: (state: ExportState) => void;
  #state: ExportState;

  constructor(options: ExportControllerOptions) {
    this.#engine = options.engine;
    this.#clock = options.clock ?? (() => new Date());
    this.#copyToClipboard = options.copyToClipboard ?? browserClipboardWrite;
    this.#downloadFile = options.downloadFile ?? browserDownload;
    this.#onStateChange = options.onStateChange;
    const today = localDayKey(this.#clock());
    this.#state = {
      copyStatus: "idle",
      rangeStart: today,
      rangeEnd: today,
      rangeError: null,
    };
  }

  get state(): ExportState {
    return this.#state;
  }

  /** Builds today's Copy-for-AI markdown and hands it to the clipboard
   * writer. Never throws: a rejected clipboard write (permission denied, no
   * clipboard API) sets `copyStatus: "error"` for the UI to render as a
   * designed inline state (Design principle 6: every state is designed),
   * rather than surfacing an unhandled rejection to whatever fired this
   * from a click handler. */
  async copyTodayForAi(): Promise<void> {
    const now = this.#clock();
    const dayKey = localDayKey(now);
    const dayEntries = await this.#engine.entriesForDay(dayKey);
    const rows = buildExportRows(dayEntries, now);
    const markdown = buildCopyForAiMarkdown(dayKey, rows);
    try {
      await this.#copyToClipboard(markdown);
      this.#setState({ copyStatus: "copied" });
    } catch {
      this.#setState({ copyStatus: "error" });
    }
  }

  setRangeStart(value: string): void {
    this.#setState({ rangeStart: value, rangeError: null });
  }

  setRangeEnd(value: string): void {
    this.#setState({ rangeEnd: value, rangeError: null });
  }

  async exportCsv(): Promise<void> {
    const rows = await this.#rowsForRange();
    if (!rows) return;
    this.#downloadFile(`time-entries_${this.#state.rangeStart}_${this.#state.rangeEnd}.csv`, buildCsv(rows), "text/csv");
  }

  async exportJson(): Promise<void> {
    const rows = await this.#rowsForRange();
    if (!rows) return;
    this.#downloadFile(
      `time-entries_${this.#state.rangeStart}_${this.#state.rangeEnd}.json`,
      buildJson(rows),
      "application/json",
    );
  }

  /** Validates the current range and, if valid, returns its rows; sets
   * `rangeError` and returns `null` otherwise. Shared by `exportCsv`/
   * `exportJson` so the validation rule lives in exactly one place. */
  async #rowsForRange() {
    if (this.#state.rangeStart > this.#state.rangeEnd) {
      this.#setState({ rangeError: "invalidOrder" });
      return null;
    }
    const dayEntries = await this.#engine.entriesForRange(this.#state.rangeStart, this.#state.rangeEnd);
    return buildExportRows(dayEntries, this.#clock());
  }

  #setState(patch: Partial<ExportState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.#state);
  }
}
