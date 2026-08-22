// Rust stays thin here: plumbing + OS integration. Business logic (timer
// state machine, parsing, exports) lands in TS from S2 onward where it's
// unit-testable without a native harness.

mod os_integration;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            tray::build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
