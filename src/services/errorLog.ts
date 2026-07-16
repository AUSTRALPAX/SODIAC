import { activityLogRepo } from "@/database/entities";

/**
 * Registra un error no controlado en activity_log (SQLite, siempre
 * persistente sin depender de ningún plugin adicional) — best-effort, si
 * la propia base falla al escribir no debe volver a lanzar.
 */
export async function recordErrorSafely(source: string, message: string, stack?: string) {
  try {
    await activityLogRepo.insert({
      id: crypto.randomUUID(),
      entity_type: "system_error",
      entity_id: null,
      action: source,
      payload_json: JSON.stringify({ message, stack: stack?.slice(0, 4000) }),
      actor: "sistema",
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[SODIAC] No se pudo registrar el error en activity_log:", e);
  }
}
