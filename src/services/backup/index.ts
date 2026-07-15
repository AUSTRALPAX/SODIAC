import { appDataDir, join } from "@tauri-apps/api/path";
import {
  copyFile,
  exists,
  mkdir,
  readFile,
  remove,
  stat,
} from "@tauri-apps/plugin-fs";
import { getDb } from "@/database/client";
import { backupRecordsRepo } from "@/database/entities";
import type { BackupRecordRow } from "@/database/types";

export type BackupType =
  | "pre_migracion"
  | "pre_importacion"
  | "pre_restauracion"
  | "pre_operacion_masiva"
  | "diario"
  | "semanal"
  | "mensual";

const RETENTION: Partial<Record<BackupType, number>> = {
  diario: 10,
  semanal: 8,
  mensual: 6,
};

const DB_FILE_NAME = "sodiac.db";
const BACKUPS_DIR_NAME = "backups";

async function backupsDir(): Promise<string> {
  const dir = await join(await appDataDir(), BACKUPS_DIR_NAME);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

async function dbFilePath(): Promise<string> {
  return join(await appDataDir(), DB_FILE_NAME);
}

async function sha256Hex(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Crea una copia completa de la base y registra un BackupRecord.
 * Ver docs/SECURITY_AND_BACKUPS.md §3 para cuándo debe invocarse.
 */
export async function createBackup(type: BackupType): Promise<BackupRecordRow> {
  const source = await dbFilePath();
  if (!(await exists(source))) {
    throw new Error("No existe una base de datos para respaldar todavía.");
  }

  const dir = await backupsDir();
  const fileName = `sodiac-${type}-${timestampSlug()}.db`;
  const target = await join(dir, fileName);

  await copyFile(source, target);
  const info = await stat(target);
  const checksum = await sha256Hex(target);

  const record: BackupRecordRow = {
    id: crypto.randomUUID(),
    backup_type: type,
    file_path: target,
    size_bytes: info.size,
    checksum,
    created_at: new Date().toISOString(),
    restored_at: null,
    restore_result: null,
  };
  await backupRecordsRepo.insert(record, "sistema");

  await applyRetention(type);
  return record;
}

async function applyRetention(type: BackupType): Promise<void> {
  const limit = RETENTION[type];
  if (!limit) return;

  const records = await backupRecordsRepo.list({
    where: "backup_type = ?",
    params: [type],
    orderBy: "created_at DESC",
  });
  const excess = records.slice(limit);
  for (const record of excess) {
    if (await exists(record.file_path)) {
      await remove(record.file_path);
    }
    const db = await getDb();
    await db.execute("DELETE FROM backup_record WHERE id = ?", [record.id]);
  }
}

export async function listBackups(): Promise<BackupRecordRow[]> {
  return backupRecordsRepo.list({ orderBy: "created_at DESC" });
}

export interface RestoreResult {
  success: boolean;
  message: string;
  integrityOk: boolean;
}

/**
 * Restaura un backup siguiendo el flujo obligatorio de
 * docs/SECURITY_AND_BACKUPS.md §5: validar, respaldar el estado actual,
 * reemplazar, comprobar integridad e informar. Requiere reiniciar la app
 * para que la conexión SQL activa recargue el archivo reemplazado.
 */
export async function restoreBackup(backupId: string): Promise<RestoreResult> {
  const record = await backupRecordsRepo.getById(backupId);
  if (!record) {
    return { success: false, message: "El backup indicado no existe.", integrityOk: false };
  }
  if (!(await exists(record.file_path))) {
    return {
      success: false,
      message: `El archivo de backup no está disponible en ${record.file_path}.`,
      integrityOk: false,
    };
  }

  await createBackup("pre_restauracion");

  const target = await dbFilePath();
  try {
    await copyFile(record.file_path, target);
  } catch (error) {
    return {
      success: false,
      message: `No se pudo reemplazar la base de datos: ${String(error)}`,
      integrityOk: false,
    };
  }

  const integrity = await checkIntegrity();

  await backupRecordsRepo.update(
    record.id,
    {
      restored_at: new Date().toISOString(),
      restore_result: integrity.ok ? "ok" : "integridad_comprometida",
    },
    "usuario",
  );

  return {
    success: true,
    integrityOk: integrity.ok,
    message: integrity.ok
      ? "Base restaurada correctamente. Reiniciá SODIAC para recargar la conexión."
      : `Base restaurada pero la comprobación de integridad falló: ${integrity.detail}`,
  };
}

export interface IntegrityResult {
  ok: boolean;
  detail: string;
}

export async function checkIntegrity(): Promise<IntegrityResult> {
  const db = await getDb();
  const rows = await db.select<Array<{ integrity_check: string }>>("PRAGMA integrity_check");
  const detail = rows.map((r) => r.integrity_check).join("; ");
  return { ok: detail === "ok", detail };
}
