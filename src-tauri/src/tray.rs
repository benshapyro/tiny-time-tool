//! Tray icon: `TrayIconBuilder` with a menu ("Open Dashboard", "Quit") and
//! three pinned visual states — idle, running, paused — each a distinct
//! template-image silhouette on macOS (`icon_as_template(true)`). On macOS
//! the tray also carries title text beside the icon (running → ticking
//! elapsed, paused → `⏸ {elapsed}`, idle → none); Windows has no tray title
//! text at all, so there the tooltip carries per-state information instead
//! (BUILD_SPEC S1 row, 2026-08-22 amendment).
//!
//! Menu labels and tooltips come from the `tray.*` keys in
//! `src/i18n/en.ts` / `es.ts`. The native tray menu is built once at startup
//! in Rust, before the webview's JS runtime is guaranteed ready, so it
//! cannot call into the TS i18n layer directly.
//!
//! S13a resolves that rather than living with it. `TrayLabels::default()`
//! below is English, and is what the menu shows for the instant between the
//! tray being built and the webview booting; from then on the strings are
//! whatever TS pushes over the `set_tray_labels` command
//! (`src/tray/trayLabels.ts` -> `src/tray/tauriTrayLabelDriver.ts`), at boot
//! and again on every language change. The catalogs stay the single source
//! of truth — no Spanish is duplicated into this file — and the same
//! "Rust stays thin: plumbing + OS integration" split as `set_tray_state`
//! applies: TS decides which strings, Rust applies them.
//!
//! Before S13a the labels here were English literals with no path back to
//! the catalogs at all. That was invisible while the app had no language
//! setting; S12 shipped one, making "Spanish app, English tray menu" a
//! reachable state. `scripts/check-i18n-coverage.mjs` is what now fails if a
//! `tray.*` key ever stops being rendered again.

use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter, Manager, Wry,
};

pub const MENU_ID_OPEN_DASHBOARD: &str = "open_dashboard";
pub const MENU_ID_QUIT: &str = "quit";

/// S5: emitted to every window on a left-click of the tray icon. Rust stays
/// thin here per this project's architecture rule (plumbing + OS
/// integration only) — the decision of what a click *means* (open vs.
/// close the popover, and refreshing its data before showing it) is
/// business logic that lives in TS (`src/app/bootstrap.ts`'s
/// `togglePopover()`), not here. The menu (Quit / Open Dashboard) still
/// opens on right-click, native OS behavior, once `show_menu_on_left_click`
/// is disabled below.
pub const TRAY_CLICKED_EVENT: &str = "tray:clicked";

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

}

/// The five user-visible strings the native tray shows, as pushed from TS.
///
/// Field names are the camelCase ones `src/tray/trayLabels.ts` sends, so the
/// wire contract is one struct rather than five positional arguments — a
/// renamed field fails to deserialize loudly instead of silently landing in
/// the wrong slot. `Default` is the English catalog, used only for the
/// instant before the webview boots and pushes the resolved locale.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels {
    pub open_dashboard: String,
    pub quit: String,
    pub tooltip_idle: String,
    pub tooltip_running: String,
    pub tooltip_paused: String,
}

impl Default for TrayLabels {
    /// Must match the `tray.*` values in `src/i18n/en.ts`. Asserted against
    /// those literals in the tests below, so drift fails `cargo test` rather
    /// than shipping a tray that disagrees with the rest of the app.
    fn default() -> Self {
        Self {
            open_dashboard: "Open Dashboard".to_string(),
            quit: "Quit".to_string(),
            tooltip_idle: "Tiny Time Tool — idle".to_string(),
            tooltip_running: "Tiny Time Tool — tracking".to_string(),
            tooltip_paused: "Tiny Time Tool — paused".to_string(),
        }
    }
}

impl TrayLabels {
    /// Tooltip text for a state. Set on all platforms via `set_tooltip`; on
    /// Windows this is the *only* per-state text a tray icon can show, since
    /// Windows trays have no title text.
    pub fn tooltip(&self, state: TrayState) -> &str {
        match state {
            TrayState::Idle => &self.tooltip_idle,
            TrayState::Running => &self.tooltip_running,
            TrayState::Paused => &self.tooltip_paused,
        }
    }
}

/// Everything the tray needs to re-render itself when either half changes
/// independently: TS pushes new LABELS on a language change and new STATE on
/// a start/pause/stop, and each has to be applied against the other's current
/// value. Without holding the last state here, a language change could only
/// update the tooltip at the next state transition — which, sitting idle, may
/// never come.
struct TrayRuntime {
    labels: Mutex<TrayLabels>,
    state: Mutex<TrayState>,
    open_dashboard: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// A poisoned lock here means another thread panicked mid-update; the tray
/// strings are still perfectly usable, and refusing to draw a menu because of
/// it would be worse than the panic.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
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
///
/// Opens in `TrayLabels::default()` (English) because nothing has booted yet
/// that could know the user's language; `set_tray_labels` replaces these the
/// moment `bootstrap.ts` runs.
pub fn build_tray(app: &App<Wry>) -> tauri::Result<()> {
    let labels = TrayLabels::default();
    let open_dashboard = MenuItem::with_id(
        app,
        MENU_ID_OPEN_DASHBOARD,
        &labels.open_dashboard,
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_ID_QUIT, &labels.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_dashboard, &quit])?;

    let icon = TrayState::Idle.load_icon()?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip(labels.tooltip(TrayState::Idle))
        .menu(&menu)
        // S5: left-click now toggles the popover (relayed to TS via
        // TRAY_CLICKED_EVENT below) instead of showing the menu; the menu
        // still opens on right-click, the native OS default once this is
        // disabled.
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = tray.app_handle().emit(TRAY_CLICKED_EVENT, ());
            }
        })
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
    // ...and the menu-item handles with it: `set_text` is the only way to
    // relabel a live native menu, and it needs the item, not the menu.
    app.manage(TrayRuntime {
        labels: Mutex::new(labels),
        state: Mutex::new(TrayState::Idle),
        open_dashboard,
        quit,
    });

    Ok(())
}

/// Applies a new set of labels: relabels the two menu items and re-applies
/// the tooltip for whatever state the tray is currently in. Called by the
/// `set_tray_labels` command (`lib.rs`) at boot and on every language change.
pub fn set_tray_labels(app: &tauri::AppHandle<Wry>, labels: TrayLabels) -> tauri::Result<()> {
    let runtime = app.state::<TrayRuntime>();
    runtime.open_dashboard.set_text(&labels.open_dashboard)?;
    runtime.quit.set_text(&labels.quit)?;

    let state = *lock(&runtime.state);
    let tray_icon = app.state::<tauri::tray::TrayIcon<Wry>>();
    tray_icon.set_tooltip(Some(labels.tooltip(state)))?;

    *lock(&runtime.labels) = labels;
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
///
/// S13a: the tooltip now comes from the labels TS last pushed, not from a
/// English constant, and the state is recorded so a later language change can
/// re-apply the right tooltip without waiting for the next transition.
pub fn set_tray_state(
    app: &tauri::AppHandle<Wry>,
    state: TrayState,
    elapsed_seconds: u64,
) -> tauri::Result<()> {
    let tray = app.state::<tauri::tray::TrayIcon<Wry>>();
    let runtime = app.state::<TrayRuntime>();
    *lock(&runtime.state) = state;

    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let icon = Image::from_path(format!("{manifest_dir}/{}", state.icon_path()))?;
    tray.set_icon(Some(icon))?;
    tray.set_tooltip(Some(lock(&runtime.labels).tooltip(state)))?;

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

    // S13a. These are deliberately written against LITERALS rather than
    // against anything derived from the struct under test: an assertion
    // phrased in terms of the thing it checks moves with it and cannot fail
    // (verification.md F11).

    #[test]
    fn the_default_labels_are_the_english_catalog_verbatim() {
        // Must stay byte-identical to the `tray.*` values in
        // `src/i18n/en.ts`. If those change, this fails — which is the
        // point: the default is the only copy of them outside the catalogs.
        let labels = TrayLabels::default();
        assert_eq!(labels.open_dashboard, "Open Dashboard");
        assert_eq!(labels.quit, "Quit");
        assert_eq!(labels.tooltip_idle, "Tiny Time Tool — idle");
        assert_eq!(labels.tooltip_running, "Tiny Time Tool — tracking");
        assert_eq!(labels.tooltip_paused, "Tiny Time Tool — paused");
    }

    /// Distinct, obviously-wrong-if-swapped values, so a tooltip wired to the
    /// neighbouring field fails instead of coincidentally reading fine.
    fn probe_labels() -> TrayLabels {
        TrayLabels {
            open_dashboard: "MENU-OPEN".to_string(),
            quit: "MENU-QUIT".to_string(),
            tooltip_idle: "TIP-IDLE".to_string(),
            tooltip_running: "TIP-RUNNING".to_string(),
            tooltip_paused: "TIP-PAUSED".to_string(),
        }
    }

    #[test]
    fn tooltip_selects_the_field_matching_the_state() {
        let labels = probe_labels();
        assert_eq!(labels.tooltip(TrayState::Idle), "TIP-IDLE");
        assert_eq!(labels.tooltip(TrayState::Running), "TIP-RUNNING");
        assert_eq!(labels.tooltip(TrayState::Paused), "TIP-PAUSED");
    }

    #[test]
    fn every_state_maps_to_a_distinct_tooltip() {
        let labels = TrayLabels::default();
        let tooltips: HashSet<&str> = TrayState::ALL.iter().map(|s| labels.tooltip(*s)).collect();
        assert_eq!(tooltips.len(), TrayState::ALL.len());
    }

    #[test]
    fn labels_deserialize_from_the_camel_case_payload_typescript_sends() {
        // The wire contract with `src/tray/trayLabels.ts`. Its `TrayLabels`
        // interface uses these exact camelCase names; a rename on either side
        // has to fail here rather than silently leaving the menu in English.
        let json = r#"{
            "openDashboard": "Abrir panel",
            "quit": "Salir",
            "tooltipIdle": "Tiny Time Tool — inactivo",
            "tooltipRunning": "Tiny Time Tool — en curso",
            "tooltipPaused": "Tiny Time Tool — en pausa"
        }"#;
        let labels: TrayLabels = serde_json::from_str(json).expect("payload should deserialize");
        assert_eq!(labels.open_dashboard, "Abrir panel");
        assert_eq!(labels.quit, "Salir");
        assert_eq!(labels.tooltip(TrayState::Running), "Tiny Time Tool — en curso");
    }

    #[test]
    fn a_snake_case_payload_is_rejected_rather_than_silently_defaulted() {
        // serde would happily fill missing fields if the struct carried
        // `#[serde(default)]`. It must not: a payload this side cannot
        // understand has to surface as an error at the command boundary.
        let json = r#"{"open_dashboard": "Abrir panel", "quit": "Salir"}"#;
        assert!(serde_json::from_str::<TrayLabels>(json).is_err());
    }
}
