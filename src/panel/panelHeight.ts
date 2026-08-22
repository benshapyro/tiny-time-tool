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

/** Matches quickEntryPanel.css: --space-4 padding top and bottom. */
const PANEL_PADDING = 16 * 2;
/** Input control: text line + vertical padding + border. */
const INPUT_HEIGHT = 52;
/** The passive "Will stop: …" notice, when present. */
const NOTICE_HEIGHT = 28;
/** Gap between the input and the suggestion list. */
const LIST_GAP = 8;
/** One suggestion row. */
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
  if (hasNotice) height += NOTICE_HEIGHT;
  if (visible > 0) height += LIST_GAP + visible * SUGGESTION_ROW;
  return height;
}
