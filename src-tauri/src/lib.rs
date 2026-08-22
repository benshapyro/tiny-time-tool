// Rust stays thin here: plumbing + OS integration. Business logic (timer
// state machine, parsing, exports) lands in TS from S2 onward where it's
// unit-testable without a native harness.

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

mod os_integration;
mod tray;

/// S2: the SQLite database the timer engine persists to, in the OS app-data
/// dir (the sqlite feature's default resolution for a bare `sqlite:<file>`
/// URL). Schema lives in `src-tauri/migrations/0001_init.sql` — the single
/// source of truth also read directly by `src/timer/nodeSqliteDriver.ts` in
/// tests. Numbered from v1 per BUILD_SPEC ("schema migrations via numbered
/// SQL files from v1"); a future schema change adds `0002_*.sql` plus a new
/// `Migration` entry here, never edits this one.
const DB_URL: &str = "sqlite:tiny-time-tool.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "settings",
            sql: include_str!("../migrations/0002_settings.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// S4: the tray-sync half of `ShortcutController`'s `onTrayStateChange`
/// seam (business logic in TS, this is plumbing only — same split as every
/// other slice). `src/app/bootstrap.ts` invokes this on every transition
/// the controller drives; the tray icon/tooltip/title are the only thing
/// Rust owns here, per the "pause must be visible, not modal" amendment.
#[tauri::command]
fn set_tray_state(
    app: tauri::AppHandle,
    state: tray::TrayState,
    elapsed_seconds: u64,
) -> Result<(), String> {
    let tray_icon = app.state::<tauri::tray::TrayIcon<tauri::Wry>>();
    tray::set_tray_state(&tray_icon, state, elapsed_seconds).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        // S3: global shortcuts. No `.with_shortcuts()`/`.with_handler()` here
        // — the shortcut -> TimerEngine mapping is business logic and lives
        // in TS (`src/shortcuts/shortcutController.ts`), driven through the
        // plugin's JS `register`/`unregister` bindings
        // (`src/shortcuts/tauriShortcutDriver.ts`). Rust only registers the
        // plugin itself, per the "Rust stays thin" constraint.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // S8: reminders. Same "Rust stays thin" split as every other
        // plugin here — the interval math and the click -> open-popover
        // decision are business logic in TS
        // (`src/reminders/reminderController.ts`), driven through the
        // plugin's JS `sendNotification`/`onAction` bindings
        // (`src/reminders/tauriNotificationDriver.ts`). Rust only
        // registers the plugin itself.
        .plugin(tauri_plugin_notification::init())
        // S12: launch-at-login. Same "Rust stays thin" split as every other
        // plugin here — the persisted intent, the reconcile-at-boot logic,
        // and the toggle live in TS (`src/settings/settingsController.ts`),
        // driven through the plugin's JS `enable`/`disable`/`isEnabled`
        // bindings (`src/settings/tauriAutostartDriver.ts`). Rust only
        // registers the plugin itself. No `MacosLauncher`/app-name override
        // — the plugin's own defaults (LaunchAgent, this app's bundle name)
        // are correct for this app.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![set_tray_state])
        .setup(|app| {
            tray::build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
