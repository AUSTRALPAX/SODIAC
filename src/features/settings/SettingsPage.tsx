import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, stat, writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  exportViewPreferences,
  importViewPreferences,
  resetAllViewPreferences,
  type ViewPreferencesExport,
} from "@/services/viewPreferences";
import {
  checkIntegrity,
  compareBackupToCurrent,
  createBackup,
  listBackups,
  protectBackup,
  restoreBackup,
  runDataProtectionDiagnostic,
  unprotectBackup,
  type BackupType,
  type DataProtectionCheck,
  type RestoreComparisonRow,
} from "@/services/backup";
import { DiagnosticItem } from "@/components/DiagnosticItem";
import { exportAllAsJson, exportEntityAsCsv, EXPORTABLE_TABLES } from "@/services/export";
import { exportAcademicMarkdown } from "@/services/aiContextExport";
import { importInstitutionalSeed, type SeedImportSummary } from "@/services/seedImport";
import {
  applyCurriculumImport,
  parseCurriculumMarkdown,
  previewCurriculumImport,
  validateParsedCurriculum,
  type CurriculumImportPreview,
  type CurriculumImportResult,
} from "@/services/curriculumImport";
import type { CurriculumImportData } from "@/schemas/curriculumImport";
import { registerCurriculumVersion } from "@/services/curriculumVersion";
import { getVaultPath, listIndexedNotes } from "@/services/obsidian";
import { enableSafeMode, isSafeModeEnabled } from "@/services/safeMode";
import { WorkflowGuide } from "./WorkflowGuide";
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
  const [viewPrefsBusy, setViewPrefsBusy] = useState(false);
  const [viewPrefsMessage, setViewPrefsMessage] = useState<string | null>(null);
  const [protectionChecks, setProtectionChecks] = useState<DataProtectionCheck[] | null>(null);
  const [protectionBusy, setProtectionBusy] = useState(false);

  const [seedBusy, setSeedBusy] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedImportSummary | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const [curriculumMarkdownText, setCurriculumMarkdownText] = useState("");
  const [curriculumFilePath, setCurriculumFilePath] = useState<string | null>(null);
  const [curriculumData, setCurriculumData] = useState<CurriculumImportData | null>(null);
  const [curriculumPreview, setCurriculumPreview] = useState<CurriculumImportPreview | null>(null);
  const [curriculumResult, setCurriculumResult] = useState<CurriculumImportResult | null>(null);
  const [curriculumBusy, setCurriculumBusy] = useState<"leyendo" | "aplicando" | null>(null);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);

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
    const comparison = await compareBackupToCurrent(backup.id);
    const comparisonText = comparison
      .map((r: RestoreComparisonRow) => `${r.table}: actual ${r.currentCount} → backup ${r.backupCount}`)
      .join("\n");
    const confirmed = window.confirm(
      `Vas a restaurar el backup del ${formatDate(backup.created_at)} (${backup.backup_type}, ${formatBytes(backup.size_bytes)}, estado: ${backup.status ?? "sin verificar"}).\n\n` +
        `Comparación de tablas críticas:\n${comparisonText}\n\n` +
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

  async function handleToggleProtect(backup: BackupRecordRow) {
    setBackupBusy(backup.id);
    try {
      if (backup.protected_at) await unprotectBackup(backup.id);
      else await protectBackup(backup.id);
      await refreshBackups();
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleRunProtectionDiagnostic() {
    setProtectionBusy(true);
    try {
      setProtectionChecks(await runDataProtectionDiagnostic());
    } finally {
      setProtectionBusy(false);
    }
  }

  async function handleCheckIntegrity() {
    const result = await checkIntegrity();
    setIntegrityResult(result.ok ? "ok" : `problema detectado: ${result.detail}`);
  }

  async function handleResetAllViewPreferences() {
    const confirmed = window.confirm(
      "Esto restablece el orden, los filtros y los paneles guardados de todas las secciones a sus valores predeterminados. No borra ningún dato académico. ¿Continuar?",
    );
    if (!confirmed) return;
    setViewPrefsBusy(true);
    setViewPrefsMessage(null);
    try {
      await resetAllViewPreferences();
      setViewPrefsMessage("Preferencias de vista restablecidas. Los cambios se ven al volver a abrir cada sección.");
    } finally {
      setViewPrefsBusy(false);
    }
  }

  async function handleExportViewPreferences() {
    setViewPrefsBusy(true);
    setViewPrefsMessage(null);
    try {
      const data = await exportViewPreferences();
      const path = await save({
        title: "Exportar preferencias de vista",
        defaultPath: `sodiac-preferencias-vista-${Date.now()}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await writeTextFile(path, JSON.stringify(data, null, 2));
      setViewPrefsMessage("Preferencias exportadas correctamente.");
    } finally {
      setViewPrefsBusy(false);
    }
  }

  async function handleImportViewPreferences() {
    setViewPrefsBusy(true);
    setViewPrefsMessage(null);
    try {
      const picked = await openDialog({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!picked || Array.isArray(picked)) return;
      const raw = await readTextFile(picked);
      const parsed = JSON.parse(raw) as ViewPreferencesExport;
      const result = await importViewPreferences(parsed);
      setViewPrefsMessage(
        `Importadas ${result.imported} preferencias${result.skipped > 0 ? `, ${result.skipped} ignoradas por formato inválido` : ""}. Los cambios se ven al volver a abrir cada sección.`,
      );
    } catch (error) {
      setViewPrefsMessage(`No se pudo importar: ${String(error)}`);
    } finally {
      setViewPrefsBusy(false);
    }
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

  async function handleChooseCurriculumMarkdown() {
    setCurriculumError(null);
    setCurriculumResult(null);
    setCurriculumPreview(null);
    setCurriculumData(null);
    setCurriculumBusy("leyendo");
    try {
      const picked = await openDialog({ multiple: false, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!picked || Array.isArray(picked)) return;
      const text = await readTextFile(picked);
      const raw = parseCurriculumMarkdown(text);
      const validation = validateParsedCurriculum(raw);
      if (!validation.valid || !validation.data) {
        setCurriculumError(validation.errors.join(" · "));
        return;
      }
      const preview = await previewCurriculumImport(validation.data);
      setCurriculumFilePath(picked);
      setCurriculumData(validation.data);
      setCurriculumPreview(preview);
    } catch (error) {
      setCurriculumError(String(error));
    } finally {
      setCurriculumBusy(null);
    }
  }

  async function handlePreviewCurriculumText() {
    setCurriculumError(null);
    setCurriculumResult(null);
    setCurriculumPreview(null);
    setCurriculumData(null);
    setCurriculumFilePath(null);
    setCurriculumBusy("leyendo");
    try {
      const raw = parseCurriculumMarkdown(curriculumMarkdownText);
      const validation = validateParsedCurriculum(raw);
      if (!validation.valid || !validation.data) {
        setCurriculumError(validation.errors.join(" · "));
        return;
      }
      const preview = await previewCurriculumImport(validation.data);
      setCurriculumData(validation.data);
      setCurriculumPreview(preview);
    } catch (error) {
      setCurriculumError(String(error));
    } finally {
      setCurriculumBusy(null);
    }
  }

  async function handleApplyCurriculumImport() {
    if (!curriculumData) return;
    setCurriculumBusy("aplicando");
    setCurriculumError(null);
    try {
      await createBackup("pre_importacion");
      const version = await registerCurriculumVersion(
        "Fase 2 — ampliación curricular",
        curriculumFilePath ?? undefined,
      );
      const result = await applyCurriculumImport(curriculumData, curriculumFilePath, version.id);
      setCurriculumResult(result);
      await refreshBackups();
    } catch (error) {
      setCurriculumError(String(error));
    } finally {
      setCurriculumBusy(null);
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

  async function handleExportAcademicMarkdown() {
    setExportBusy("markdown");
    setExportMessage(null);
    try {
      const result = await exportAcademicMarkdown();
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

      <WorkflowGuide />

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
            onClick={() => handleCreateBackup("manual")}
            className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-50"
          >
            {backupBusy === "manual" ? "Creando…" : "Crear backup ahora"}
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
                  · {b.backup_type} · {formatBytes(b.size_bytes)} ·{" "}
                  <span
                    className={
                      b.status === "verificado"
                        ? "text-success"
                        : b.status == null
                          ? "text-text-muted"
                          : "text-danger"
                    }
                  >
                    {b.status ?? "sin verificar"}
                  </span>
                  {b.protected_at && <span className="ml-1 text-accent">· protegido</span>}
                </span>
                {b.restored_at && (
                  <span className="ml-2 text-xs text-success">restaurado {formatDate(b.restored_at)}</span>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  disabled={backupBusy !== null}
                  onClick={() => handleToggleProtect(b)}
                  className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {b.protected_at ? "Desproteger" : "Proteger"}
                </button>
                <button
                  disabled={backupBusy !== null}
                  onClick={() => handleRestore(b)}
                  className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {backupBusy === b.id ? "Restaurando…" : "Restaurar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Datos y recuperación
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Diagnóstico rápido de que la persistencia y los backups están funcionando.
        </p>
        <button
          disabled={protectionBusy}
          onClick={handleRunProtectionDiagnostic}
          className="mt-3 rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-50"
        >
          {protectionBusy ? "Comprobando…" : "Comprobar que mis datos están protegidos"}
        </button>
        {protectionChecks && (
          <div className="mt-3 grid grid-cols-2 gap-3 rounded border border-border-subtle bg-surface p-3 text-xs sm:grid-cols-3">
            {protectionChecks.map((c) => (
              <DiagnosticItem key={c.label} label={c.label} value={c.detail} tone={c.ok ? "success" : "danger"} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Preferencias de vista
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Orden, filtros y paneles que cada sección recuerda (Biblioteca, Trayectoria, Carrera,
          Mapa, Sesiones, Repasos, Obsidian, Proyectos, Documentos). Restablecerlas no borra
          ningún dato académico.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={viewPrefsBusy}
            onClick={handleResetAllViewPreferences}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Restablecer todas las vistas
          </button>
          <button
            disabled={viewPrefsBusy}
            onClick={handleExportViewPreferences}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Exportar preferencias
          </button>
          <button
            disabled={viewPrefsBusy}
            onClick={handleImportViewPreferences}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Importar preferencias
          </button>
        </div>
        {viewPrefsMessage && <p className="mt-2 text-xs text-text-muted">{viewPrefsMessage}</p>}
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
          Ampliación curricular (Markdown)
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Elegí un documento Markdown con materias, unidades y temas nuevos. Las materias se
          identifican por título — si el título ya existe, nunca se duplica, solo se cuelgan
          unidades y temas nuevos debajo. Antes de aplicar se muestra una previsualización;
          "Confirmar importación" crea un backup y registra una versión curricular nueva.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={curriculumBusy !== null}
            onClick={handleChooseCurriculumMarkdown}
            className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {curriculumBusy === "leyendo" ? "Leyendo…" : "Elegir archivo Markdown…"}
          </button>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-text-muted hover:text-text-secondary">
            O pegar el Markdown directamente
          </summary>
          <textarea
            value={curriculumMarkdownText}
            onChange={(e) => setCurriculumMarkdownText(e.target.value)}
            rows={6}
            className="mt-2 w-full rounded border border-border bg-background p-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
            placeholder="# Carrera&#10;version: ...&#10;### Materia: CODE|Título exacto ya existente&#10;#### Unidad: CODE|Título nuevo&#10;- Tema: CODE|Título nuevo"
          />
          <button
            disabled={curriculumBusy !== null || !curriculumMarkdownText.trim()}
            onClick={handlePreviewCurriculumText}
            className="mt-2 rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {curriculumBusy === "leyendo" ? "Leyendo…" : "Previsualizar texto pegado"}
          </button>
        </details>
        {curriculumError && <p className="mt-2 text-xs text-danger">{curriculumError}</p>}
        {curriculumPreview && (
          <div className="mt-3 rounded border border-border-subtle bg-surface p-3 text-xs">
            <p className="text-text-secondary">
              {curriculumPreview.toCreate} a crear · {curriculumPreview.toUpdate} a actualizar ·{" "}
              {curriculumPreview.unchanged} sin cambios
            </p>
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
              {curriculumPreview.items.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-text-muted">
                    [{item.kind}] {item.label}
                  </span>
                  <span
                    className={
                      item.action === "crear" ? "text-accent" : item.action === "actualizar" ? "text-warning" : "text-text-muted"
                    }
                  >
                    {item.action}
                  </span>
                </li>
              ))}
            </ul>
            <button
              disabled={curriculumBusy !== null}
              onClick={handleApplyCurriculumImport}
              className="mt-3 rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-50"
            >
              {curriculumBusy === "aplicando" ? "Aplicando…" : "Confirmar importación"}
            </button>
          </div>
        )}
        {curriculumResult && (
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-text-secondary sm:grid-cols-3">
            <li>Materias creadas: {curriculumResult.subjectsCreated}</li>
            <li>Materias actualizadas: {curriculumResult.subjectsUpdated}</li>
            <li>Unidades creadas: {curriculumResult.unitsCreated}</li>
            <li>Temas creados: {curriculumResult.topicsCreated}</li>
            <li>Actividades creadas: {curriculumResult.activitiesCreated}</li>
            <li>Créditos recalculados: {curriculumResult.creditsRecalculated}</li>
            {curriculumResult.subjectsSkipped.length > 0 && (
              <li className="col-span-full text-danger">
                Omitidas: {curriculumResult.subjectsSkipped.join(" · ")}
              </li>
            )}
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
          <button
            disabled={exportBusy !== null}
            onClick={handleExportAcademicMarkdown}
            className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {exportBusy === "markdown" ? "Exportando…" : "Contenidos académicos (Markdown)"}
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
          El paquete comprimido (base SQLite + configuración + manifiesto, para portabilidad o
          migración) queda pendiente para una fase futura.
        </p>
      </section>
    </div>
  );
}
