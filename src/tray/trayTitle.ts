import type { TrayState } from "./trayState";

/**
 * Formats elapsed seconds as ticking tray-title text: `M:SS` under an hour,
 * `H:MM:SS` at or beyond an hour — the common menu-bar-timer convention.
 * Not a value BUILD_SPEC pins verbatim (only the pause-symbol shape is);
 * this is S1's chosen format for the live-ticking macOS tray title, kept
 * deliberately distinct from the "Xh Ym" duration format used in
 * Log/Insights/exports, since a second-level ticker needs seconds.
 */
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Maps tray state + elapsed seconds to the macOS tray title text
 * (BUILD_SPEC S1 row, 2026-08-22 amendment): running → ticking elapsed
 * time, paused → `⏸ {elapsed}`, idle → empty (no title — icon carries
 * idle). Windows has no tray title text at all; the Rust side guards the
 * actual `set_title` call to macOS only and mirrors this same mapping
 * (`title_for_state` in `src-tauri/src/tray.rs`) so both sides agree.
 */
export function trayTitleForState(state: TrayState, elapsedSeconds: number): string {
  switch (state) {
    case "idle":
      return "";
    case "running":
      return formatElapsed(elapsedSeconds);
    case "paused":
      return `⏸ ${formatElapsed(elapsedSeconds)}`;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
