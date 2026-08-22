// Guards the design-review fix: the panel window must grow to fit its
// content so suggestions are never sliced by the window edge (the defect the
// S4 screenshots showed in light and dark, en and es).

import { describe, expect, it } from "vitest";
import { MAX_VISIBLE_SUGGESTIONS, panelHeightFor } from "./panelHeight";

describe("panelHeightFor", () => {
  it("is at its shortest with just the input — no empty space below", () => {
    const bare = panelHeightFor({ suggestionCount: 0, hasNotice: false });
    expect(bare).toBeGreaterThan(0);
    // Nothing else on screen should be shorter than the bare input panel.
    expect(bare).toBeLessThan(panelHeightFor({ suggestionCount: 1, hasNotice: false }));
  });

  it("grows with each suggestion, so no row is clipped", () => {
    const heights = [0, 1, 2, 3].map((n) =>
      panelHeightFor({ suggestionCount: n, hasNotice: false }),
    );
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1] as number);
    }
  });

  it("the two-suggestion case that was visibly clipped now fits", () => {
    // The old window was a fixed 480x160; the screenshots showed the second
    // suggestion cut in half. Whatever the exact arithmetic, two suggestions
    // must need more than the old fixed height.
    expect(panelHeightFor({ suggestionCount: 2, hasNotice: false })).toBeGreaterThan(160);
  });

  it("stops growing past MAX_VISIBLE_SUGGESTIONS — the list scrolls instead", () => {
    const atCap = panelHeightFor({ suggestionCount: MAX_VISIBLE_SUGGESTIONS, hasNotice: false });
    const wayOver = panelHeightFor({ suggestionCount: 50, hasNotice: false });
    expect(wayOver).toBe(atCap);
  });

  it("reserves room for the switch notice when one is shown", () => {
    expect(panelHeightFor({ suggestionCount: 0, hasNotice: true })).toBeGreaterThan(
      panelHeightFor({ suggestionCount: 0, hasNotice: false }),
    );
  });

  it("treats a negative count as zero rather than shrinking the panel", () => {
    expect(panelHeightFor({ suggestionCount: -3, hasNotice: false })).toBe(
      panelHeightFor({ suggestionCount: 0, hasNotice: false }),
    );
  });
});
