import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, stat } from "@tauri-apps/plugin-fs";
import {
  type BackupType,
  checkIntegrity,
  createBackup,
  listBackups,
  restoreBackup,
} from "@/services/backup";
import { exportAllAsJson, exportEntityAsCsv, EXPORTABLE_TABLES } from "@/services/export";
import { importInstitutionalSeed, type SeedImportSummary } from "@/services/seedImport";
import { getVaultPath, listIndexedNotes } from "@/services/obsidian";
import { enableSafeMode, isSafeModeEnabled } from "@/services/safeMode";
import type { BackupRecordRow } from "@/database/types";

/** Debe coincidir con `identifier` en src-tauri/tauri.conf.json — no hay API de Tauri para leerlo en vivo desde el frontend. */
const APP_IDENTIFIER = "com.sodiac.desktop";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR");
}

export function SettingsPage() {
  const [appVersion, setAppVersion] = useState<string>("…");
  const [dataDir, setDataDir] = useState<string>("");
  const [dbPath, setDbPath] = useState<string>("");
  const [dbSize, setDbSize] = useState<number | null>(null);
  const [dbExists, setDbExists] = useState(false);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [safeModeQueued, setSafeModeQueued] = useState(isSafeModeEnabled());

  const [backups, setBackups] = useState<BackupRecordRow[]>([]);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [integrityResult, setIntegrityResult] = useState<string | null>(null);

  const [seedBusy, setSeedBusy] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedImportSummary | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const refreshSystemStatus = useCallback(async () => {
    const [dir, version, vault, notes] = await Promise.all([
      appDataDir(),
      getVersion(),
      getVaultPath(),
      listIndexedNotes(),
    ]);
    const dbFile = await join(dir, "sodiac.db");
    setDataDir(dir);
    setDbPath(dbFile);
    setAppVersion(version);
    setVaultPath(vault);
    setNoteCount(notes.length);
    const dbThere = await exists(dbFile);
    setDbExists(dbThere);
    setDbSize(dbThere ? (await stat(dbFile)).size : null);
  }, []);

  const refreshBackups = useCallback(async () => {
    setBackups(await listBackups());
  }, []);

  useEffect(() => {
    void refreshSystemStatus();
    void refreshBackups();
  }, [refreshSystemStatus, refreshBackups]);

  async function handleCreateBackup(type: BackupType) {
    setBackupBusy(type);
    try {
      await createBackup(type);
      await refreshBackups();
      await refreshSystemStatus();
    } catch (error) {
      setExportMessage(`No se pudo crear el backup: ${String(error)}`);
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleRestore(backup: BackupRecordRow) {
    const confirmed = window.confirm(
      `Vas a restaurar el backup del ${formatDate(backup.created_at)} (${backup.backup_type}, ${formatBytes(backup.size_bytes)}). ` +
        "Esto reemplaza la base de datos actual (se crea un backup de seguridad antes de reemplazarla). ¿Continuar?",
    );
    if (!confirmed) return;

    setBackupBusy(backup.id);
    try {
      const result = await restoreBackup(backup.id);
      window.alert(result.message);
      await refreshBackups();
      await refreshSystemStatus();
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleCheckIntegrity() {
    const result = await checkIntegrity();
    setIntegrityResult(result.ok ? "ok" : `problema detectado: ${result.detail}`);
  }

  async function handleImportSeed() {
    setSeedBusy(true);
    setSeedError(null);
    try {
      await createBackup("pre_importacion");
      const summary = await importInstitutionalSeed();
      setSeedResult(summary);
      await refreshBackups();
    } catch (error) {
      setSeedError(String(error));
    } finally {
      setSeedBusy(false);
    }
  }

  async function handleExportJson() {
    setExportBusy("json");
    setExportMessage(null);
    try {
      const result = await exportAllAsJson();
      setExportMessage(result ? `Exportado a ${result.path}` : "Exportación cancelada.");
    } catch (error) {
      setExportMessage(`Error al exportar: ${String(error)}`);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleExportCsv(table: (typeof EXPORTABLE_TABLES)[number]) {
    setExportBusy(table);
    setExportMessage(null);
    try {
      const result = await exportEntityAsCsv(table);
      setExportMessage(result ? `Exportado a ${result.path}` : "Exportación cancelada.");
    } catch (error) {
      setExportMessage(`Error al exportar: ${String(error)}`);
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-10">
      <h1 className="font-display text-2xl">Configuración</h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Estado del sistema
        </h2>
        <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-2 rounded border border-border-subtle bg-surface p-4 text-sm">
          <dt className="text-text-muted">Versión</dt>
          <dd>{appVersion}</dd>
          <dt className="text-text-muted">Identificador</dt>
          <dd className="text-text-secondary">{APP_IDENTIFIER}</dd>
          <dt className="text-text-muted">Ruta de datos</dt>
          <dd className="break-all text-text-secondary">{dataDir || "…"}</dd>
          <dt className="text-text-muted">Base de datos</dt>
          <dd className="break-all text-text-secondary">
            {dbPath || "…"} {dbExists ? `(${formatBytes(dbSize)})` : "(aún no creada)"}
          </dd>
          <dt className="text-text-muted">Vault de Obsidian</dt>
          <dd className="break-all text-text-secondary">{vaultPath ?? "No configurado"}</dd>
          <dt className="text-text-muted">Notas indexadas</dt>
          <dd className="text-text-secondary">{noteCount ?? "…"}</dd>
          <dt className="text-text-muted">Último backup</dt>
          <dd>{backups[0] ? formatDate(backups[0].created_at) : "ninguno todavía"}</dd>
          <dt className="text-text-muted">Integridad</dt>
          <dd>
            <button
              onClick={handleCheckIntegrity}
              className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
            >
              Comprobar ahora
            </button>{" "}
            {integrityResult && <span className="text-text-secondary">{integrityResult}</span>}
          </dd>
          <dt className="text-text-muted">Modo seguro</dt>
          <dd>
            <button
              onClick={() => {
                enableSafeMode(!safeModeQueued);
                setSafeModeQueued(!safeModeQueued);
              }}
              className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
            >
              {safeModeQueued ? "Desactivar (activado para el próximo inicio)" : "Activar para el próximo inicio"}
            </button>
          </dd>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Backups
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Retención: 10 diarios, 8 semanales, 6 mensuales. Los backups pre-operación se
          conservan sin límite automático (docs/SECURITY_AND_BACKUPS.md).
        </p>
        <div className="mt-3 flex gap-2">
          <button
            disabled={backupBusy !== null}
            onClick={() => handleCreateBackup("diario")}
            className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-50"
          >
            {backupBusy === "diario" ? "Creando…" : "Crear backup ahora"}
          </button>
        </div>
        <ul className="mt-4 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {backups.length === 0 && (
            <li className="p-4 text-sm text-text-muted">Todavía no hay backups.</li>
          )}
          {backups.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-4 p-3 text-sm">
              <div>
                <span className="text-text-primary">{formatDate(b.created_at)}</span>{" "}
                <span className="text-text-muted">
                  · {b.backup_type} · {formatBytes(b.size_bytes)}
                </span>
                {b.restored_at && (
                  <span className="ml-2 text-xs text-success">restaurado {formatDate(b.restored_at)}</span>
                )}
              </div>
              <button
                disabled={backupBusy !== null}
                onClick={() => handleRestore(b)}
                className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {backupBusy === b.id ? "Restaurando…" : "Restaurar"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Datos institucionales
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Importa la estructura del Instituto (preguntas, competencias, materias, temas,
          etapas, Primera Misión, documentos) desde <code>seed/</code>. Es seguro reejecutarlo:
          no duplica lo ya importado. Crea un backup antes de importar.
        </p>
        <button
          disabled={seedBusy}
          onClick={handleImportSeed}
          className="mt-3 rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-50"
        >
          {seedBusy ? "Importando…" : "Importar estructura institucional"}
        </button>
        {seedError && <p className="mt-2 text-xs text-danger">{seedError}</p>}
        {seedResult && (
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-text-secondary sm:grid-cols-3">
            <li>Preguntas: {seedResult.fundamentalQuestions}</li>
            <li>Competencias: {seedResult.competencies}</li>
            <li>Etapas: {seedResult.learningStages}</li>
            <li>Materias: {seedResult.subjects}</li>
            <li>Temas: {seedResult.topics}</li>
            <li>Proyectos: {seedResult.projects}</li>
            <li>Documentos: {seedResult.institutionalDocuments}</li>
            <li>Ya existían: {seedResult.skipped}</li>
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Exportar
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={exportBusy !== null}
            onClick={handleExportJson}
            className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {exportBusy === "json" ? "Exportando…" : "Todo (JSON)"}
          </button>
          {EXPORTABLE_TABLES.map((table) => (
            <button
              key={table}
              disabled={exportBusy !== null}
              onClick={() => handleExportCsv(table)}
              className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {exportBusy === table ? "…" : `${table} (CSV)`}
            </button>
          ))}
        </div>
        {exportMessage && <p className="mt-2 text-xs text-text-secondary">{exportMessage}</p>}
        <p className="mt-2 text-xs text-text-muted">
          Markdown para contenidos académicos y el paquete comprimido con manifiesto se agregan
          en Fase 4 y en cuanto exista contenido de sesiones para exportar.
        </p>
      </section>
    </div>
  );
}
