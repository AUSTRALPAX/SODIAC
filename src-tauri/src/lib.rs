use tauri_plugin_sql::{Migration, MigrationKind};

mod vault_watcher;

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init_schema",
            sql: include_str!("../../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "library_institutional_fields",
            sql: include_str!("../../migrations/0002_library_institutional_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "document_viewer_ranges",
            sql: include_str!("../../migrations/0003_document_viewer_ranges.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "obsidian_sync_state",
            sql: include_str!("../../migrations/0004_obsidian_sync_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "academic_progression",
            sql: include_str!("../../migrations/0005_academic_progression.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "academic_assignment_base_columns",
            sql: include_str!("../../migrations/0006_academic_assignment_base_columns.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "academic_updated_at_columns",
            sql: include_str!("../../migrations/0007_academic_updated_at_columns.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sodiac.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(vault_watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            vault_watcher::start_vault_watcher,
            vault_watcher::stop_vault_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
