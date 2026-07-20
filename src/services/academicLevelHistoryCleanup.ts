import { getDb } from "@/database/client";

/**
 * Limpieza puntual (Fase 3): `academic_level_history` tenía 29 filas de
 * semilla de desarrollo (niveles 0-28, todas insertadas en el mismo
 * segundo del 16/7/2026 a las 07:45:28, con `xp_total_at` fijo en 1800) que
 * nunca reflejaron actividad real — `xp_event` tiene 0 filas reales. No es
 * solo ruido: `checkAndRecordLevelUp()` en `xp.ts` compara el nivel real
 * contra `MAX(level)` de esta tabla, así que con la fila de nivel 28 de
 * semilla ahí, un usuario real llegando a nivel 1-27 nunca quedaría
 * registrado. Se corre una sola vez contra una instalación existente — una
 * instalación nueva nunca tiene estas filas, así que no hace falta
 * migración.
 */
export interface PurgeStaleLevelHistoryResult {
  deleted: number;
}

const STALE_SEED_TIMESTAMP_PREFIX = "2026-07-16T07:45:28";

export async function purgeStaleAcademicLevelHistory(): Promise<PurgeStaleLevelHistoryResult> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM academic_level_history WHERE reached_at LIKE ?",
    [`${STALE_SEED_TIMESTAMP_PREFIX}%`],
  );
  if (rows.length === 0) return { deleted: 0 };
  await db.execute("DELETE FROM academic_level_history WHERE reached_at LIKE ?", [
    `${STALE_SEED_TIMESTAMP_PREFIX}%`,
  ]);
  return { deleted: rows.length };
}
