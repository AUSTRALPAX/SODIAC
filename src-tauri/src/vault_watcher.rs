use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

type VaultDebouncer = Debouncer<notify::RecommendedWatcher, FileIdMap>;

/// Handle mantenido en el estado gestionado de Tauri: al reemplazarlo (nuevo
/// vault, o detener el watcher) el Debouncer anterior se dropea y su hilo de
/// fondo termina solo.
pub struct WatcherState(pub Mutex<Option<VaultDebouncer>>);

impl Default for WatcherState {
    fn default() -> Self {
        WatcherState(Mutex::new(None))
    }
}

#[derive(Clone, serde::Serialize)]
struct VaultChangeEvent {
    paths: Vec<String>,
    kind: String,
}

/// Watcher nativo del vault de Obsidian (docs/UPDATE_1_1_BASELINE.md —
/// sincronización bidireccional). Debounce de 800ms para no reaccionar a cada
/// escritura intermedia de un editor externo.
#[tauri::command]
pub fn start_vault_watcher(app: AppHandle, state: State<WatcherState>, path: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;

    let app_handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(800),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let mut paths = Vec::new();
                let mut kind = String::from("modify");
                for event in &events {
                    for p in &event.event.paths {
                        if p.extension().and_then(|e| e.to_str()) == Some("md") {
                            paths.push(p.to_string_lossy().to_string());
                        }
                    }
                    kind = format!("{:?}", event.event.kind);
                }
                if !paths.is_empty() {
                    let _ = app_handle.emit("obsidian-vault-changed", VaultChangeEvent { paths, kind });
                }
            }
            Err(errors) => {
                for e in errors {
                    log::error!("Error del watcher del vault: {:?}", e);
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(debouncer);
    Ok(())
}

#[tauri::command]
pub fn stop_vault_watcher(state: State<WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}
