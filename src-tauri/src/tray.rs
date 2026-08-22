//! Tray icon: `TrayIconBuilder` with a menu ("Open Dashboard", "Quit") and
//! three pinned visual states — idle, running, paused — each a distinct
//! template-image silhouette on macOS (`icon_as_template(true)`). On macOS
//! the tray also carries title text beside the icon (running → ticking
//! elapsed, paused → `⏸ {elapsed}`, idle → none); Windows has no tray title
//! text at all, so there the tooltip carries per-state information instead
//! (BUILD_SPEC S1 row, 2026-08-22 amendment).
//!
//! Menu labels and tooltips mirror the `tray.*` keys in `src/i18n/en.ts` /
//! `es.ts`. The native tray menu is built once at startup in Rust (before
//! the webview's JS runtime is guaranteed ready), so it cannot call into
//! the TS i18n layer directly; OS-locale-aware label switching is wired in
//! S12 (Settings → language) via menu item `set_text` calls. Until then
//! this defaults to English and the two catalogs are kept in sync by
//! convention — the Rust-side unit tests below only prove the pure
//! state→icon-asset and state→title-text mappings, not the labels.

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, Manager, Wry,
};

pub const MENU_ID_OPEN_DASHBOARD: &str = "open_dashboard";
pub const MENU_ID_QUIT: &str = "quit";

/// Mirrors `TrayState` in `src/tray/trayState.ts`. Constructed from the
/// `set_tray_state` Tauri command (`lib.rs`), which `src/app/bootstrap.ts`
/// invokes from `ShortcutController`'s `onTrayStateChange` seam — the
/// lowercase `serde` rename matches the TS union (`"idle" | "running" |
/// "paused"`) exactly, so the wire value needs no translation on either
/// side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrayState {
    Idle,
    Running,
    Paused,
}

#[allow(dead_code)]
impl TrayState {
    pub const ALL: [TrayState; 3] = [TrayState::Idle, TrayState::Running, TrayState::Paused];

    /// Path relative to `src-tauri/`, matching `TRAY_ICON_ASSET` in
    /// `src/tray/trayState.ts`. Kept as a plain path string (rather than
    /// only the embedded `Image`) so the mapping itself — not just the
    /// bytes — is what the test asserts, mirroring the TS-side model.
    pub const fn icon_path(self) -> &'static str {
        match self {
            TrayState::Idle => "icons/tray-idle.png",
            TrayState::Running => "icons/tray-running.png",
            TrayState::Paused => "icons/tray-paused.png",
        }
    }

    /// Loads the embedded icon bytes for this state. Uses `Image::from_path`
    /// against `CARGO_MANIFEST_DIR`-relative paths at startup (rather than
    /// `include_image!`, which requires a `const` per-variant path and can't
    /// take `self.icon_path()`), so the same string in `icon_path()` is what
    /// actually gets loaded — no separate literal to drift out of sync.
    fn load_icon(self) -> tauri::Result<Image<'static>> {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        Image::from_path(format!("{manifest_dir}/{}", self.icon_path()))
    }

    /// Tooltip text for this state. Mirrors `tray.tooltip.*` in
    /// `src/i18n/en.ts` — same convention/caveat as the menu labels above
    /// (English default until S12 wires OS-locale detection). Set on all
    /// platforms via `set_tooltip`; on Windows this is the *only* per-state
    /// text a tray icon can show, since Windows trays have no title text.
    pub const fn tooltip(self) -> &'static str {
        match self {
            TrayState::Idle => "Tiny Time Tool — idle",
            TrayState::Running => "Tiny Time Tool — tracking",
            TrayState::Paused => "Tiny Time Tool — paused",
        }
    }
}

/// Formats elapsed seconds as ticking tray-title text: `M:SS` under an
/// hour, `H:MM:SS` at or beyond an hour. Mirrors `formatElapsed` in
/// `src/tray/trayTitle.ts`.
pub fn format_elapsed(total_seconds: u64) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes}:{seconds:02}")
    }
}

/// Maps tray state + elapsed seconds to the macOS tray title text
/// (BUILD_SPEC S1 row, 2026-08-22 amendment). Mirrors `trayTitleForState`
/// in `src/tray/trayTitle.ts`. The pause glyph is U+23F8 (⏸).
pub fn title_for_state(state: TrayState, elapsed_seconds: u64) -> String {
    match state {
        TrayState::Idle => String::new(),
        TrayState::Running => format_elapsed(elapsed_seconds),
        TrayState::Paused => format!("\u{23F8} {}", format_elapsed(elapsed_seconds)),
    }
}

/// Builds the tray icon and its menu, and registers it on the app.
pub fn build_tray(app: &App<Wry>) -> tauri::Result<()> {
    let open_dashboard = MenuItem::with_id(
        app,
        MENU_ID_OPEN_DASHBOARD,
        "Open Dashboard",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_ID_QUIT, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_dashboard, &quit])?;

    let icon = TrayState::Idle.load_icon()?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip(TrayState::Idle.tooltip())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_ID_OPEN_DASHBOARD => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            MENU_ID_QUIT => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    // Keep the tray handle alive for the app's lifetime.
    app.manage(tray);

    Ok(())
}

/// Updates the tray icon, tooltip, and (macOS only) title text to reflect a
/// new state + elapsed duration. Called by the (future) timer state machine
/// (S2/S3) whenever start/pause/resume/stop changes state or the ticking
/// title needs a fresh elapsed value.
///
/// Per BUILD_SPEC S1 (2026-08-22 amendment): the tray title is macOS-only —
/// `TrayIcon::set_title` is unsupported on Windows, and the design there is
/// icon state + tooltip carrying the information instead, so the title call
/// is guarded to `target_os = "macos"` rather than relying on the
/// underlying crate silently ignoring it. The tooltip (`state.tooltip()`)
/// is set on every platform.
pub fn set_tray_state(
    tray: &tauri::tray::TrayIcon<Wry>,
    state: TrayState,
    elapsed_seconds: u64,
) -> tauri::Result<()> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let icon = Image::from_path(format!("{manifest_dir}/{}", state.icon_path()))?;
    tray.set_icon(Some(icon))?;
    tray.set_tooltip(Some(state.tooltip()))?;

    #[cfg(target_os = "macos")]
    {
        let title = title_for_state(state, elapsed_seconds);
        tray.set_title(if title.is_empty() { None } else { Some(title) })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::path::Path;

    #[test]
    fn maps_all_three_states_to_the_pinned_assets() {
        assert_eq!(TrayState::Idle.icon_path(), "icons/tray-idle.png");
        assert_eq!(TrayState::Running.icon_path(), "icons/tray-running.png");
        assert_eq!(TrayState::Paused.icon_path(), "icons/tray-paused.png");
    }

    #[test]
    fn the_three_asset_paths_are_distinct() {
        let paths: HashSet<&str> = TrayState::ALL.iter().map(|s| s.icon_path()).collect();
        assert_eq!(paths.len(), TrayState::ALL.len());
    }

    #[test]
    fn the_three_asset_files_exist_on_disk() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        for state in TrayState::ALL {
            let path = Path::new(manifest_dir).join(state.icon_path());
            assert!(path.exists(), "missing tray asset: {}", path.display());
        }
    }

    #[test]
    fn format_elapsed_under_an_hour_is_m_ss() {
        assert_eq!(format_elapsed(0), "0:00");
        assert_eq!(format_elapsed(59), "0:59");
        assert_eq!(format_elapsed(65), "1:05");
    }

    #[test]
    fn format_elapsed_at_or_over_an_hour_is_h_mm_ss() {
        assert_eq!(format_elapsed(3600), "1:00:00");
        assert_eq!(format_elapsed(3661), "1:01:01");
    }

    #[test]
    fn title_for_state_maps_idle_to_empty() {
        assert_eq!(title_for_state(TrayState::Idle, 125), "");
    }

    #[test]
    fn title_for_state_maps_running_to_ticking_elapsed() {
        assert_eq!(title_for_state(TrayState::Running, 125), "2:05");
    }

    #[test]
    fn title_for_state_maps_paused_to_pause_symbol_plus_elapsed() {
        assert_eq!(title_for_state(TrayState::Paused, 125), "\u{23F8} 2:05");
        assert_eq!(title_for_state(TrayState::Paused, 3661), "\u{23F8} 1:01:01");
    }
}
