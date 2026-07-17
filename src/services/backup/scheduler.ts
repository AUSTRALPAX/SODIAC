import { createBackup, listBackups, type BackupType } from "@/services/backup";
import type { BackupRecordRow } from "@/database/types";

const DAY_MS = 86_400_000;

/** Cada tipo automático vence después de tantos días desde su último backup exitoso (o si nunca hubo uno). */
const CADENCE_DAYS: Record<"diario" | "semanal" | "mensual", number> = {
  diario: 1,
  semanal: 7,
  mensual: 30,
};

export function pickDueBackupTypes(backups: BackupRecordRow[], now: Date): BackupType[] {
  const due: BackupType[] = [];
  for (const type of Object.keys(CADENCE_DAYS) as (keyof typeof CADENCE_DAYS)[]) {
    const latest = backups
      .filter((b) => b.backup_type === type)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!latest) {
      due.push(type);
      continue;
    }
    const ageMs = now.getTime() - new Date(latest.created_at).getTime();
    if (ageMs >= CADENCE_DAYS[type] * DAY_MS) due.push(type);
  }
  return due;
}

/**
 * SODIAC no tiene un proceso en segundo plano — en vez de un scheduler real,
 * al iniciar la app se revisa qué backups automáticos ya vencieron (más de
 * 1/7/30 días desde el último) y se crean acá. Sin esto, la política de
 * retención de "semanal"/"mensual" es código muerto porque nada los generaba
 * nunca (ver docs/PERSISTENCE_AND_BACKUP_BASELINE.md).
 */
export async function runStartupBackupCheck(): Promise<void> {
  try {
    const backups = await listBackups();
    const due = pickDueBackupTypes(backups, new Date());
    for (const type of due) {
      await createBackup(type);
    }
  } catch (error) {
    console.error("[SODIAC] No se pudo completar la verificación de backups automáticos al iniciar:", error);
  }
}
