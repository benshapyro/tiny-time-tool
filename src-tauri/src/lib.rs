// Rust stays thin here: plumbing + OS integration. Business logic (timer
// state machine, parsing, exports) lands in TS from S2 onward where it's
// unit-testable without a native harness.

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
    vec![Migration {
        version: 1,
        description: "init",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }]
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
        .setup(|app| {
            tray::build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
