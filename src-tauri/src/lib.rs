use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

mod vault_watcher;

/// Cierre seguro de ventana (H4): el frontend puede tener un autoguardado
/// debounced pendiente (borrador de "Finalizar estudio") cuando el usuario
/// cierra la app. En vez de cerrar de inmediato, se intercepta el cierre,
/// se le pide al frontend que flushee ese guardado, y solo cuando confirma
/// (vía `confirm_app_close`) se deja pasar el cierre real.
///
/// `flush_requested` evita un bug encontrado en vivo: si el usuario (o una
/// automatización) pide cerrar la ventana más de una vez mientras el primer
/// flush todavía está en curso, cada `CloseRequested` volvía a emitir
/// `sodiac://flush-before-close`, y cada flush terminado invocaba
/// `confirm_app_close` por su cuenta — la segunda invocación llamaba
/// `window.close()` sobre una ventana que la primera ya había empezado a
/// destruir, lo que coincide con un panic conocido de `tao` en Windows
/// ("cannot move state from Destroyed") y dejaba el proceso vivo pero sin
/// responder a más cierres. Con este flag, un segundo `CloseRequested`
/// mientras ya hay un flush en curso simplemente no hace nada más (el
/// primer ciclo ya se va a encargar de cerrar la ventana).
#[derive(Default)]
struct CloseState {
    allow_close: AtomicBool,
    flush_requested: AtomicBool,
}

#[tauri::command]
fn confirm_app_close(app: tauri::AppHandle, state: tauri::State<CloseState>) {
    // Idempotente: si ya se había confirmado el cierre antes (por ejemplo,
    // un segundo flush que termina tarde), no volver a llamar window.close()
    // sobre una ventana que ya se está destruyendo.
    if state.allow_close.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
}

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
        Migration {
            version: 8,
            description: "completion_xp",
            sql: include_str!("../../migrations/0008_completion_xp.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "carrera",
            sql: include_str!("../../migrations/0009_carrera.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "resource_usage",
            sql: include_str!("../../migrations/0010_resource_usage.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "curriculum_reconciliation",
            sql: include_str!("../../migrations/0011_curriculum_reconciliation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "bibliography_austrofinancial",
            sql: include_str!("../../migrations/0012_bibliography_austrofinancial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "resource_reading_state_en_proceso",
            sql: include_str!("../../migrations/0013_resource_reading_state_en_proceso.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "backup_record_manual_and_verification",
            sql: include_str!("../../migrations/0014_backup_record_manual_and_verification.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "validation_xp_category",
            sql: include_str!("../../migrations/0015_validation_xp_category.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "xp_rules_and_curriculum_version",
            sql: include_str!("../../migrations/0016_xp_rules_and_curriculum_version.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Instancia única: debe registrarse antes que cualquier otro plugin.
    // Cuando el usuario hace doble clic mientras SODIAC ya está corriendo,
    // en vez de abrir una segunda ventana, se enfoca y restaura la existente.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("Segunda instancia detectada — redirigiendo foco a la ventana existente.");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .setup(|app| {
            // Logging persistente en AppLog — antes solo se activaba en debug;
            // sin esto, un release que no llega a abrir ventana o crashea no
            // deja ningún rastro (cierre silencioso).
            let mut log_targets = vec![tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::LogDir { file_name: None },
            )];
            if cfg!(debug_assertions) {
                log_targets.push(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ));
            }
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets(log_targets)
                    .build(),
            )?;

            log::info!(
                "SODIAC iniciando — versión {}, identificador {}",
                app.package_info().version,
                app.config().identifier,
            );

            // Panic hook: un panic de Rust hoy hace desaparecer el proceso sin
            // dejar rastro. Se registra en el mismo directorio de logs antes de
            // que el proceso termine, para poder diagnosticar un cierre silencioso.
            if let Ok(log_dir) = app.path().app_log_dir() {
                let _ = std::fs::create_dir_all(&log_dir);
                let panic_log_path = log_dir.join("panic.log");
                std::panic::set_hook(Box::new(move |info| {
                    log::error!("PANIC: {info}");
                    use std::io::Write;
                    if let Ok(mut file) = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&panic_log_path)
                    {
                        let elapsed = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        let _ = writeln!(file, "[unix_ts={elapsed}] PANIC: {info}\n---");
                    }
                }));
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
        .manage(CloseState::default())
        .invoke_handler(tauri::generate_handler![
            vault_watcher::start_vault_watcher,
            vault_watcher::stop_vault_watcher,
            confirm_app_close,
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<CloseState>();
                if state.allow_close.load(Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();
                if state.flush_requested.swap(true, Ordering::SeqCst) {
                    // Ya hay un flush en curso de un CloseRequested anterior — no
                    // pedir otro (ver comentario en CloseState).
                    return;
                }
                log::info!("Cierre de ventana interceptado — solicitando flush de guardados pendientes al frontend.");
                let _ = window.emit("sodiac://flush-before-close", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
