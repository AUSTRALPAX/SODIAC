import Database from "@tauri-apps/plugin-sql";
import { appDataDir, join } from "@tauri-apps/api/path";
import { copyFile, exists, mkdir, readFile, remove, stat, writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "@/database/client";
import { backupRecordsRepo, documentVersionsRepo, institutionalDocumentsRepo, resourcesRepo } from "@/database/entities";
import type { BackupRecordRow } from "@/database/types";

export type BackupType =
  | "pre_migracion"
  | "pre_importacion"
  | "pre_restauracion"
  | "pre_operacion_masiva"
  | "diario"
  | "semanal"
  | "mensual"
  | "manual";

const RETENTION: Partial<Record<BackupType, number>> = {
  diario: 10,
  semanal: 8,
  mensual: 6,
};

/** Tablas que se cuentan para verificar un backup — no es la lista completa del esquema, son las de mayor riesgo si algo sale mal. */
const CRITICAL_TABLES = ["subject", "topic", "study_session", "resource", "project", "xp_event", "user_setting"] as const;

const DB_FILE_NAME = "sodiac.db";
const BACKUPS_DIR_NAME = "backups";

/** Debe coincidir con `identifier` en src-tauri/tauri.conf.json — no hay API de Tauri para leerlo en vivo desde el frontend. */
const APP_IDENTIFIER = "com.sodiac.desktop";
const MANIFEST_FORMAT_VERSION = 1;

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

function toSqliteUrl(filePath: string): string {
  return `sqlite:${filePath.split("\\").join("/")}`;
}

async function countRows(db: Database, table: string): Promise<number> {
  try {
    const rows = await db.select<Array<{ c: number }>>(`SELECT COUNT(*) as c FROM ${table}`);
    return rows[0]?.c ?? 0;
  } catch {
    return -1;
  }
}

async function getSchemaVersion(db: Database): Promise<number | null> {
  try {
    const rows = await db.select<Array<{ version: number }>>("SELECT MAX(version) as version FROM _sqlx_migrations WHERE success = 1");
    return rows[0]?.version ?? null;
  } catch {
    return null;
  }
}

interface VerificationResult {
  status: BackupRecordRow["status"];
  schemaVersion: number | null;
  recordCounts: Record<string, number>;
  detail: string;
}

/**
 * Abre el snapshot recién creado en una conexión aparte (nunca la que usa la
 * app en vivo), corre integrity_check + foreign_key_check, compara conteos
 * de las tablas críticas contra la base viva, y cierra la conexión. Nunca se
 * informa "backup creado" antes de que esto termine (sección 16 del pedido).
 */
async function verifyBackupFile(targetPath: string): Promise<VerificationResult> {
  const liveDb = await getDb();
  let snapshot: Database | null = null;
  try {
    snapshot = await Database.load(toSqliteUrl(targetPath));

    const integrityRows = await snapshot.select<Array<{ integrity_check: string }>>("PRAGMA integrity_check");
    const integrityOk = integrityRows.map((r) => r.integrity_check).join("; ") === "ok";

    const fkRows = await snapshot.select<unknown[]>("PRAGMA foreign_key_check");
    const fkOk = fkRows.length === 0;

    const schemaVersion = await getSchemaVersion(snapshot);

    const recordCounts: Record<string, number> = {};
    let countsMismatch = false;
    for (const table of CRITICAL_TABLES) {
      const backupCount = await countRows(snapshot, table);
      const liveCount = await countRows(liveDb, table);
      recordCounts[table] = backupCount;
      if (backupCount < 0 || backupCount !== liveCount) countsMismatch = true;
    }

    if (!integrityOk || !fkOk) {
      return {
        status: "corrupto",
        schemaVersion,
        recordCounts,
        detail: !integrityOk ? "integrity_check falló" : "foreign_key_check encontró violaciones",
      };
    }
    if (countsMismatch) {
      return { status: "incompleto", schemaVersion, recordCounts, detail: "los conteos de tablas críticas no coinciden con la base viva" };
    }
    return { status: "verificado", schemaVersion, recordCounts, detail: "ok" };
  } catch (error) {
    return { status: "incompatible", schemaVersion: null, recordCounts: {}, detail: String(error) };
  } finally {
    // OJO: `close()` sin argumento cierra TODOS los pools abiertos (incluida
    // la conexión viva de sodiac.db) — hay que pasar explícitamente el path
    // de esta conexión para cerrar solo el snapshot.
    if (snapshot) await snapshot.close(snapshot.path);
  }
}

interface ExternalFileEntry {
  path: string;
  exists: boolean;
  sizeBytes: number | null;
}

/**
 * Lista (sin copiar) los archivos externos referenciados hoy por Biblioteca
 * y Documentos — nunca el vault de Obsidian. Ver sección 11 del pedido: por
 * defecto solo se registran en el manifiesto, no se empaquetan.
 */
async function listKnownExternalFiles(): Promise<ExternalFileEntry[]> {
  const [resources, documents, versions] = await Promise.all([
    resourcesRepo.list({ where: "file_path IS NOT NULL" }),
    institutionalDocumentsRepo.list(),
    documentVersionsRepo.list({ where: "file_path IS NOT NULL" }),
  ]);
  const paths = new Set<string>();
  for (const r of resources) if (r.file_path) paths.add(r.file_path);
  for (const v of versions) if (v.file_path) paths.add(v.file_path);
  void documents; // el path vive en document_version, no en institutional_document.

  const entries: ExternalFileEntry[] = [];
  for (const path of paths) {
    try {
      const fileExists = await exists(path);
      const info = fileExists ? await stat(path) : null;
      entries.push({ path, exists: fileExists, sizeBytes: info?.size ?? null });
    } catch {
      entries.push({ path, exists: false, sizeBytes: null });
    }
  }
  return entries;
}

interface BackupManifest {
  formatVersion: number;
  sodiacVersion: string;
  identifier: string;
  createdAt: string;
  backupType: BackupType;
  schemaVersion: number | null;
  sourcePath: string;
  recordCounts: Record<string, number>;
  checksum: string;
  sizeBytes: number;
  status: BackupRecordRow["status"];
  externalFiles: ExternalFileEntry[];
}

async function writeManifest(manifestPath: string, manifest: BackupManifest): Promise<void> {
  await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Crea un snapshot consistente de la base (VACUUM INTO, no una copia cruda
 * del archivo — ver sección 13 del pedido), lo verifica antes de confirmar
 * nada, escribe un manifiesto al lado, y registra el BackupRecord con el
 * resultado real de la verificación.
 */
export async function createBackup(type: BackupType): Promise<BackupRecordRow> {
  const source = await dbFilePath();
  if (!(await exists(source))) {
    throw new Error("No existe una base de datos para respaldar todavía.");
  }

  const dir = await backupsDir();
  const fileName = `sodiac-${type}-${timestampSlug()}.db`;
  const target = await join(dir, fileName);

  const liveDb = await getDb();
  await liveDb.execute("VACUUM INTO ?", [target]);

  const info = await stat(target);
  const checksum = await sha256Hex(target);
  const verification = await verifyBackupFile(target);
  const externalFiles = await listKnownExternalFiles();

  const sodiacVersionMod = await import("@tauri-apps/api/app");
  const sodiacVersion = await sodiacVersionMod.getVersion().catch(() => "desconocida");

  await writeManifest(`${target}.manifest.json`, {
    formatVersion: MANIFEST_FORMAT_VERSION,
    sodiacVersion,
    identifier: APP_IDENTIFIER,
    createdAt: new Date().toISOString(),
    backupType: type,
    schemaVersion: verification.schemaVersion,
    sourcePath: source,
    recordCounts: verification.recordCounts,
    checksum,
    sizeBytes: info.size,
    status: verification.status,
    externalFiles,
  });

  const record: BackupRecordRow = {
    id: crypto.randomUUID(),
    backup_type: type,
    file_path: target,
    size_bytes: info.size,
    checksum,
    created_at: new Date().toISOString(),
    restored_at: null,
    restore_result: null,
    status: verification.status,
    schema_version: verification.schemaVersion,
    record_counts_json: JSON.stringify(verification.recordCounts),
    protected_at: null,
  };
  await backupRecordsRepo.insert(record, "sistema");

  await applyRetention(type);
  return record;
}

/** Marca un backup como protegido — nunca se borra por retención automática, sea cual sea su tipo. */
export async function protectBackup(id: string): Promise<void> {
  await backupRecordsRepo.update(id, { protected_at: new Date().toISOString() }, "usuario");
}

export async function unprotectBackup(id: string): Promise<void> {
  await backupRecordsRepo.update(id, { protected_at: null }, "usuario");
}

async function applyRetention(type: BackupType): Promise<void> {
  const limit = RETENTION[type];
  if (!limit) return;

  const records = await backupRecordsRepo.list({
    where: "backup_type = ? AND protected_at IS NULL",
    params: [type],
    orderBy: "created_at DESC",
  });
  const excess = records.slice(limit);
  for (const record of excess) {
    if (await exists(record.file_path)) {
      await remove(record.file_path);
    }
    const manifestPath = `${record.file_path}.manifest.json`;
    if (await exists(manifestPath)) {
      await remove(manifestPath);
    }
    const db = await getDb();
    await db.execute("DELETE FROM backup_record WHERE id = ?", [record.id]);
  }
}

export async function listBackups(): Promise<BackupRecordRow[]> {
  return backupRecordsRepo.list({ orderBy: "created_at DESC" });
}

export interface RestoreComparisonRow {
  table: string;
  currentCount: number;
  backupCount: number;
}

/** Compara conteos de tablas críticas entre el backup y la base actual — paso 2 del asistente de restauración (sección 17 del pedido). */
export async function compareBackupToCurrent(backupId: string): Promise<RestoreComparisonRow[]> {
  const record = await backupRecordsRepo.getById(backupId);
  if (!record || !(await exists(record.file_path))) return [];

  const liveDb = await getDb();
  let snapshot: Database | null = null;
  try {
    snapshot = await Database.load(toSqliteUrl(record.file_path));
    const rows: RestoreComparisonRow[] = [];
    for (const table of CRITICAL_TABLES) {
      const currentCount = await countRows(liveDb, table);
      const backupCount = await countRows(snapshot, table);
      rows.push({ table, currentCount, backupCount });
    }
    return rows;
  } finally {
    // OJO: `close()` sin argumento cierra TODOS los pools abiertos (incluida
    // la conexión viva de sodiac.db) — hay que pasar explícitamente el path
    // de esta conexión para cerrar solo el snapshot.
    if (snapshot) await snapshot.close(snapshot.path);
  }
}

export interface RestoreResult {
  success: boolean;
  message: string;
  integrityOk: boolean;
}

/**
 * Restaura un backup: exige que ya esté verificado (o lo verifica de nuevo
 * si nunca se marcó), crea un backup de seguridad del estado actual antes de
 * tocar nada, reemplaza el archivo, y confirma integridad. Requiere
 * reiniciar la app para que la conexión SQL activa recargue el archivo
 * reemplazado — no hay forma de cerrar/reabrir la conexión en caliente
 * (`src/database/client.ts` no expone esa capacidad).
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

  let status = record.status;
  if (status == null) {
    const verification = await verifyBackupFile(record.file_path);
    status = verification.status;
    await backupRecordsRepo.update(record.id, { status }, "sistema");
  }
  if (status !== "verificado") {
    return {
      success: false,
      message: `Este backup no está verificado (estado: ${status ?? "desconocido"}) — no se restaura para no arriesgar la base actual.`,
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

export interface DataProtectionCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Diagnóstico "Comprobar que mis datos están protegidos" (sección 19 del
 * pedido): conexión a SQLite, integridad, antigüedad del último backup por
 * tipo automático contra la política de retención, y archivos externos
 * referenciados que ya no existen en disco.
 */
export async function runDataProtectionDiagnostic(): Promise<DataProtectionCheck[]> {
  const checks: DataProtectionCheck[] = [];

  try {
    await getDb();
    checks.push({ label: "Conexión a la base de datos", ok: true, detail: "alcanzable" });
  } catch (error) {
    checks.push({ label: "Conexión a la base de datos", ok: false, detail: String(error) });
    return checks;
  }

  const integrity = await checkIntegrity();
  checks.push({ label: "Integridad de la base", ok: integrity.ok, detail: integrity.detail });

  const backups = await listBackups();
  const now = Date.now();
  for (const type of ["diario", "semanal", "mensual"] as const) {
    const latest = backups.filter((b) => b.backup_type === type).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!latest) {
      checks.push({ label: `Último backup ${type}`, ok: false, detail: "todavía no se creó ninguno" });
      continue;
    }
    const ageDays = Math.floor((now - new Date(latest.created_at).getTime()) / 86_400_000);
    const limit = { diario: 1, semanal: 7, mensual: 30 }[type];
    checks.push({
      label: `Último backup ${type}`,
      ok: ageDays <= limit,
      detail: `hace ${ageDays} día(s) · ${latest.status ?? "sin verificar"}`,
    });
  }

  const [resources, versions] = await Promise.all([
    resourcesRepo.list({ where: "file_path IS NOT NULL" }),
    documentVersionsRepo.list({ where: "file_path IS NOT NULL" }),
  ]);
  const paths = [...resources.map((r) => r.file_path), ...versions.map((v) => v.file_path)].filter(
    (p): p is string => !!p,
  );
  let missing = 0;
  for (const path of paths) {
    if (!(await exists(path))) missing += 1;
  }
  checks.push({
    label: "Archivos externos referenciados",
    ok: missing === 0,
    detail: missing === 0 ? `${paths.length} archivo(s), todos presentes` : `${missing} de ${paths.length} ya no se encuentran`,
  });

  return checks;
}
