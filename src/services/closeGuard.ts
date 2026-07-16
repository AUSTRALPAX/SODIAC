/**
 * Cierre seguro de ventana (H4): el backend (src-tauri/src/lib.rs) intercepta
 * `WindowEvent::CloseRequested`, impide el cierre y emite `sodiac://flush-before-close`.
 * Este módulo mantiene el registro de guardados pendientes (hoy, el borrador
 * de "Finalizar estudio" en ActiveSessionPage) para poder flushearlos antes
 * de autorizar el cierre real, y escucha ese evento para hacerlo.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const pendingFlushes = new Set<() => Promise<void>>();

export function registerPendingSave(flush: () => Promise<void>): () => void {
  pendingFlushes.add(flush);
  return () => {
    pendingFlushes.delete(flush);
  };
}

export async function flushAllPendingSaves(): Promise<void> {
  await Promise.all([...pendingFlushes].map((flush) => flush().catch(() => undefined)));
}

let initialized = false;

/** Se llama una sola vez, desde src/app/main.tsx, al arrancar la app. */
export function initCloseGuard(): void {
  if (initialized) return;
  initialized = true;
  void listen("sodiac://flush-before-close", () => {
    void flushAllPendingSaves()
      .catch(() => undefined)
      .then(() => invoke("confirm_app_close"))
      .catch((e) => console.error("[SODIAC] No se pudo confirmar el cierre de la ventana:", e));
  });
}
