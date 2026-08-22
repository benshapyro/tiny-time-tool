import { describe, expect, it } from "vitest";
import { formatElapsed, trayTitleForState } from "./trayTitle";

describe("formatElapsed (pure elapsed-time helper for the macOS tray title)", () => {
  it("formats under an hour as M:SS", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(59)).toBe("0:59");
    expect(formatElapsed(65)).toBe("1:05");
  });

  it("formats an hour or more as H:MM:SS", () => {
    expect(formatElapsed(3600)).toBe("1:00:00");
    expect(formatElapsed(3661)).toBe("1:01:01");
  });
});

describe("trayTitleForState (S1 title-text model)", () => {
  it("idle -> empty (no title)", () => {
    expect(trayTitleForState("idle", 125)).toBe("");
  });

  it("running -> ticking elapsed time", () => {
    expect(trayTitleForState("running", 125)).toBe("2:05");
  });

  it("paused -> pause symbol + elapsed (⏸ {elapsed})", () => {
    expect(trayTitleForState("paused", 125)).toBe("⏸ 2:05");
  });

  it("paused with over an hour elapsed", () => {
    expect(trayTitleForState("paused", 3661)).toBe("⏸ 1:01:01");
  });
});
