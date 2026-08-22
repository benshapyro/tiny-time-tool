// Panel window height, derived from what the panel is actually showing.
//
// WHY THIS EXISTS — a design-review finding on S4. The panel window was a
// fixed, non-resizable 480×160 while its content (input, optional notice, and
// up to N autocomplete suggestions) is variable height, and the suggestion
// list is `overflow: hidden`. With two suggestions the second row was already
// sliced in half by the window edge — visible in the S4 screenshots in both
// light and dark, en and es.
//
// That breaks Design principle 6 ("every state is designed") and pre-empts
// S13b's no-clipped-text rule, so the window is sized to its content instead
// of the content being cropped to the window. Growing downward from a fixed
// top keeps the input anchored where the eye already is, which matters more
// here than centering: the panel exists to be typed into within ~2 seconds.
//
// Kept as a pure function so the arithmetic is unit-testable without a live
// window — the container just applies the result.

/** Suggestions shown at once; beyond this the list scrolls rather than
 *  growing the window without bound. Five keeps the panel glanceable. */
export const MAX_VISIBLE_SUGGESTIONS = 5;

// S13b re-derived every constant below against the CSS and against real
// measurements in Chrome (via `src/layout/layoutHarness.test.tsx`). Three
// of them were wrong, and all three were wrong in the UNSAFE direction —
// the panel was 26px shorter than its own Spanish content, which sliced the
// third suggestion row in half. The defect is the same class as F5: an
// arithmetic model that had drifted from the stylesheet it models.
//
// Every value here is an UPPER bound on what the browser renders. Over-
// estimating costs a few pixels of empty panel; under-estimating loses a
// row, which is the whole reason this function exists.

/** quickEntryPanel.css: `.quick-entry` padding `var(--space-4)`, top and bottom. */
const PANEL_PADDING = 16 * 2;
/** `.quick-entry` `gap: var(--space-3)` — between EVERY pair of children,
 *  not just the input and the list. This was 8 (`--space-2`), the wrong
 *  token, and it was only ever counted once. */
const CHILD_GAP = 12;
/** Input control: `var(--space-3)` padding both sides + hairline borders +
 *  the 18px line box. Chrome renders 47.5px; 52 keeps headroom for a wider
 *  platform font. */
const INPUT_HEIGHT = 52;
/** The passive "Will stop: …" notice: `var(--space-2)` padding both sides +
 *  hairline borders + a 12px line box. Chrome renders 34.8px. This was 28,
 *  which did not cover the box the stylesheet actually asks for. */
const NOTICE_HEIGHT = 36;
/** One suggestion row: `var(--space-2)` padding both sides + a 14px line box
 *  + the hairline border-top. Chrome renders 36.6px. Rows are pinned to a
 *  single line by `.quick-entry__suggestion` (S13b) — without that a long
 *  Spanish suggestion wrapped and the row was 55px, which no fixed height
 *  here could have covered. */
const SUGGESTION_ROW = 40;

export interface PanelHeightInput {
  suggestionCount: number;
  hasNotice: boolean;
}

/**
 * Total window height in logical pixels for the given panel content.
 * Never smaller than the bare input, never taller than input + notice +
 * MAX_VISIBLE_SUGGESTIONS rows.
 */
export function panelHeightFor({ suggestionCount, hasNotice }: PanelHeightInput): number {
  const visible = Math.max(0, Math.min(suggestionCount, MAX_VISIBLE_SUGGESTIONS));
  let height = PANEL_PADDING + INPUT_HEIGHT;
  if (hasNotice) height += CHILD_GAP + NOTICE_HEIGHT;
  if (visible > 0) height += CHILD_GAP + visible * SUGGESTION_ROW;
  return height;
}
