/**
 * Tray-state → icon-asset model.
 *
 * Mirrors the Rust-side mapping in `src-tauri/src/tray.rs` (kept in sync
 * manually; each side has its own test). Three pinned visual states —
 * idle, running, paused — each mapped to a distinct template-image asset
 * under `src-tauri/icons/`. Paths are relative to `src-tauri/`, matching
 * how `tauri.conf.json`'s `bundle.icon` and the Rust tray builder resolve
 * them.
 */
export type TrayState = "idle" | "running" | "paused";

export const TRAY_STATES: readonly TrayState[] = ["idle", "running", "paused"];

export const TRAY_ICON_ASSET: Record<TrayState, string> = {
  idle: "icons/tray-idle.png",
  running: "icons/tray-running.png",
  paused: "icons/tray-paused.png",
};
