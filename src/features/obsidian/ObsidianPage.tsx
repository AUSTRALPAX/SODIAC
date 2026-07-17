import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useViewPreference } from "@/hooks/useViewPreference";
import { OBSIDIAN_VIEW_DEFAULTS, obsidianViewPreferenceSchema } from "@/schemas/viewPreferences";
import {
  createNoteFromTemplate,
  getPermissionMode,
  getSyncDiagnostics,
  getVaultPath,
  indexVault,
  listIndexedNotes,
  onVaultChanged,
  openNoteInObsidian,
  openVaultFolder,
  openVaultInObsidian,
  pickVaultFolder,
  readNoteBody,
  setPermissionMode,
  setVaultPath,
  startVaultWatcher,
  stopVaultWatcher,
  updateNoteBody,
  verifyObsidianIntegration,
  ObsidianConflictError,
  type IndexSummary,
  type ObsidianDiagnostics,
  type ObsidianOpenResult,
  type SyncDiagnostics,
} from "@/services/obsidian";
import { isSafeModeEnabled } from "@/services/safeMode";
import {
  clearBrokenTopicCompetencyRefs,
  computeAcademicIntegrityAudit,
  generateSequentialDependencies,
  importCareerFromObsidian,
  listReconciliationCandidates,
  previewReconciliation,
  type AcademicIntegrityAudit,
  type ReconciliationCandidate,
  type ReconciliationPreview,
  type ReconciliationSummary,
  type SequentialDependencyResult,
} from "@/services/curriculumReconciliation";
import {
  clearOrphanedBibliographicLinks,
  computeBibliographyIntegrityAudit,
  type BibliographyIntegrityAudit,
} from "@/services/bibliographyIntegrity";
import type { ObsidianNoteRow, ObsidianPermissionMode } from "@/database/types";

const SYNC_STATE_LABEL: Record<ObsidianNoteRow["sync_state"], string> = {
  sincronizada: "Sincronizada",
  pendiente: "Cambios locales pendientes",
  conflicto: "Conflicto",
  no_encontrada: "Archivo no encontrado",
  error: "Error",
  solo_lectura: "Solo lectura",
};

const SYNC_STATE_COLOR: Record<ObsidianNoteRow["sync_state"], string> = {
  sincronizada: "text-success",
  pendiente: "text-warning",
  conflicto: "text-danger",
  no_encontrada: "text-danger",
  error: "text-danger",
  solo_lectura: "text-text-muted",
};

const PERMISSION_LABEL: Record<ObsidianPermissionMode, string> = {
  solo_lectura: "Solo lectura",
  lectura_creacion: "Lectura y creación",
  lectura_creacion_actualizacion_metadatos: "Lectura, creación y actualización de metadatos",
};

export function ObsidianPage() {
  const [vaultPath, setVaultPathState] = useState<string | null>(null);
  const [permissionMode, setPermissionModeState] = useState<ObsidianPermissionMode>("solo_lectura");
  const [notes, setNotes] = useState<ObsidianNoteRow[]>([]);
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference(
    "obsidian",
    obsidianViewPreferenceSchema,
    OBSIDIAN_VIEW_DEFAULTS,
  );
  const { search } = viewPrefs;
  const [indexing, setIndexing] = useState(false);
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<ObsidianDiagnostics | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [openFailure, setOpenFailure] = useState<ObsidianOpenResult | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnostics | null>(null);
  const [reconciliationPreview, setReconciliationPreview] = useState<ReconciliationPreview | null>(null);
  const [reconciliationSummary, setReconciliationSummary] = useState<ReconciliationSummary | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [previewingReconciliation, setPreviewingReconciliation] = useState(false);
  const [integrityAudit, setIntegrityAudit] = useState<AcademicIntegrityAudit | null>(null);
  const [auditingIntegrity, setAuditingIntegrity] = useState(false);
  const [clearingRefs, setClearingRefs] = useState(false);
  const [bibliographyAudit, setBibliographyAudit] = useState<BibliographyIntegrityAudit | null>(null);
  const [auditingBibliography, setAuditingBibliography] = useState(false);
  const [clearingOrphanedLinks, setClearingOrphanedLinks] = useState(false);
  const [dependencyResult, setDependencyResult] = useState<SequentialDependencyResult | null>(null);
  const [generatingDependencies, setGeneratingDependencies] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [candidates, setCandidates] = useState<ReconciliationCandidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [importingSelected, setImportingSelected] = useState(false);
  const [editingNote, setEditingNote] = useState<ObsidianNoteRow | null>(null);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ note: ObsidianNoteRow; diskContent: string; myBody: string } | null>(null);

  const refresh = useCallback(async () => {
    const [path, mode, indexedNotes] = await Promise.all([
      getVaultPath(),
      getPermissionMode(),
      listIndexedNotes(),
    ]);
    setVaultPathState(path);
    setPermissionModeState(mode);
    setNotes(indexedNotes);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!vaultPath) return;
    if (isSafeModeEnabled()) return; // Modo seguro: no reconstruir el índice ni sincronizar al abrir.
    let unlisten: (() => void) | undefined;
    void startVaultWatcher();
    void onVaultChanged(() => void refresh()).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
      void stopVaultWatcher();
    };
  }, [vaultPath, refresh]);

  async function handlePickVault() {
    setError(null);
    const path = await pickVaultFolder();
    if (!path) return;
    await setVaultPath(path);
    await refresh();
  }

  async function handlePermissionChange(mode: ObsidianPermissionMode) {
    await setPermissionMode(mode);
    setPermissionModeState(mode);
  }

  async function handleIndex() {
    setIndexing(true);
    setError(null);
    try {
      const result = await indexVault();
      setSummary(result);
      await refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setIndexing(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      setDiagnostics(await verifyObsidianIntegration());
      setSyncDiagnostics(await getSyncDiagnostics());
    } finally {
      setVerifying(false);
    }
  }

  async function handleAuditIntegrity() {
    setAuditingIntegrity(true);
    try {
      setIntegrityAudit(await computeAcademicIntegrityAudit());
    } finally {
      setAuditingIntegrity(false);
    }
  }

  async function handleAuditBibliography() {
    setAuditingBibliography(true);
    try {
      setBibliographyAudit(await computeBibliographyIntegrityAudit());
    } finally {
      setAuditingBibliography(false);
    }
  }

  async function handleClearOrphanedLinks() {
    if (!bibliographyAudit) return;
    const confirmed = window.confirm(
      `Esto va a borrar ${bibliographyAudit.orphanedLinks} vínculo(s) bibliográfico(s) sin ninguna materia/unidad/tema/proyecto asociado. No borra ningún recurso. ¿Continuar?`,
    );
    if (!confirmed) return;
    setClearingOrphanedLinks(true);
    try {
      await clearOrphanedBibliographicLinks();
      setBibliographyAudit(await computeBibliographyIntegrityAudit());
    } finally {
      setClearingOrphanedLinks(false);
    }
  }

  async function handleClearBrokenRefs() {
    if (!integrityAudit) return;
    const confirmed = window.confirm(
      `Esto va a limpiar ${integrityAudit.brokenTopicCompetencyRefs} referencia(s) rota(s) tema→competencia (las deja sin competencia asignada, no borra el tema). ¿Continuar?`,
    );
    if (!confirmed) return;
    setClearingRefs(true);
    try {
      await clearBrokenTopicCompetencyRefs();
      setIntegrityAudit(await computeAcademicIntegrityAudit());
    } finally {
      setClearingRefs(false);
    }
  }

  async function handleGenerateDependencies() {
    setGeneratingDependencies(true);
    try {
      setDependencyResult(await generateSequentialDependencies());
    } finally {
      setGeneratingDependencies(false);
    }
  }

  async function handleOpenWizard() {
    setShowWizard((s) => !s);
    if (showWizard) return; // se está cerrando, no hace falta recargar
    setLoadingCandidates(true);
    try {
      const list = await listReconciliationCandidates();
      setCandidates(list);
      setSelectedRefs(new Set(list.filter((c) => c.confidence === "alta").map((c) => c.externalRef)));
    } finally {
      setLoadingCandidates(false);
    }
  }

  function toggleCandidate(externalRef: string) {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(externalRef)) next.delete(externalRef);
      else next.add(externalRef);
      return next;
    });
  }

  async function handleImportSelected() {
    setImportingSelected(true);
    try {
      const result = await importCareerFromObsidian({ onlyExternalRefs: selectedRefs });
      setReconciliationSummary(result);
      setReconciliationPreview(await previewReconciliation());
      setCandidates(await listReconciliationCandidates());
      setSelectedRefs(new Set());
    } finally {
      setImportingSelected(false);
    }
  }

  async function handlePreviewReconciliation() {
    setPreviewingReconciliation(true);
    setReconciliationSummary(null);
    try {
      setReconciliationPreview(await previewReconciliation());
    } finally {
      setPreviewingReconciliation(false);
    }
  }

  async function handleImportReconciliation() {
    setReconciling(true);
    try {
      const result = await importCareerFromObsidian();
      setReconciliationSummary(result);
      setReconciliationPreview(await previewReconciliation());
    } finally {
      setReconciling(false);
    }
  }

  async function handleOpenEditor(note: ObsidianNoteRow) {
    setSaveError(null);
    setEditingNote(note);
    setEditBody(await readNoteBody(note.id));
  }

  async function handleSaveNote() {
    if (!editingNote) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateNoteBody(editingNote.id, editBody);
      setEditingNote(null);
      await refresh();
    } catch (e) {
      if (e instanceof ObsidianConflictError) {
        setConflict({ note: editingNote, diskContent: e.currentDiskContent, myBody: editBody });
      } else {
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleResolveConflict(choice: "mine" | "disk" | "cancel") {
    if (!conflict) return;
    if (choice === "cancel") {
      setConflict(null);
      return;
    }
    if (choice === "disk") {
      setEditBody(conflict.diskContent);
      setConflict(null);
      return;
    }
    // "mine": forzar la escritura ignorando el checksum previo, re-sincronizando primero.
    await indexVault();
    setConflict(null);
    setSaving(true);
    try {
      await updateNoteBody(conflict.note.id, conflict.myBody);
      setEditingNote(null);
      await refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenVault() {
    setOpenFailure(null);
    const result = await openVaultInObsidian();
    if (!result.success) setOpenFailure(result);
  }

  async function handleOpenNote(note: ObsidianNoteRow) {
    setOpenFailure(null);
    const result = await openNoteInObsidian(note.vault_relative_path);
    if (!result.success) setOpenFailure(result);
  }

  async function handleOpenFolder() {
    await openVaultFolder();
  }

  async function handleCopyUri(uri: string) {
    await navigator.clipboard.writeText(uri);
  }

  async function handleCreateNote(e: FormEvent) {
    e.preventDefault();
    if (!newPath.trim() || !newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const relativePath = newPath.trim().endsWith(".md") ? newPath.trim() : `${newPath.trim()}.md`;
      await createNoteFromTemplate(
        relativePath,
        {
          sodiac_id: crypto.randomUUID(),
          tipo: "nota_conceptual",
          pregunta: "",
          competencias: [],
          materias: [],
          temas: [],
          estado: "borrador",
          dominio: "",
          ultima_revision: "",
          proxima_revision: "",
          proyectos: [],
          fuentes: [],
        },
        `# ${newTitle.trim()}\n\nEscribí acá el contenido de la nota.\n`,
      );
      setShowCreate(false);
      setNewPath("");
      setNewTitle("");
      await handleIndex();
    } catch (e) {
      setCreateError(String(e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  }

  const filteredNotes = useMemo(
    () => notes.filter((n) => !search || n.vault_relative_path.toLowerCase().includes(search.toLowerCase())),
    [notes, search],
  );

  const canCreate = permissionMode !== "solo_lectura";

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="mx-auto max-w-3xl p-10">
      <h1 className="font-display text-2xl">Obsidian</h1>

      <section className="mt-6 rounded border border-border-subtle bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Vault</p>
            <p className="mt-1 break-all text-sm text-text-primary">{vaultPath ?? "No configurado todavía."}</p>
          </div>
          <button
            onClick={handlePickVault}
            className="shrink-0 rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent"
          >
            {vaultPath ? "Elegir otro vault" : "Elegir carpeta"}
          </button>
        </div>

        {vaultPath && (
          <>
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Permisos</p>
              <select
                value={permissionMode}
                onChange={(e) => handlePermissionChange(e.target.value as ObsidianPermissionMode)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                {(Object.keys(PERMISSION_LABEL) as ObsidianPermissionMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {PERMISSION_LABEL[mode]}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
              >
                {verifying ? "Verificando…" : "Verificar integración"}
              </button>
              <button
                onClick={handleOpenVault}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
              >
                Abrir Obsidian
              </button>
              <button
                onClick={handleOpenFolder}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
              >
                Abrir carpeta del vault
              </button>
              <button
                onClick={handleIndex}
                disabled={indexing}
                className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent disabled:opacity-40"
              >
                {indexing ? "Sincronizando…" : "Reindexar / Sincronizar ahora"}
              </button>
              <button
                onClick={() => setShowCreate((s) => !s)}
                disabled={!canCreate}
                title={canCreate ? undefined : "El modo actual es solo lectura"}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Nueva nota
              </button>
            </div>

            {diagnostics && (
              <div className="mt-4 grid grid-cols-2 gap-3 rounded border border-border-subtle bg-background p-3 text-xs sm:grid-cols-3">
                <DiagnosticItem label="Nombre del vault" value={diagnostics.vaultName ?? "—"} />
                <DiagnosticItem
                  label="Carpeta"
                  value={diagnostics.vaultExists ? "Disponible" : "No encontrada"}
                  tone={diagnostics.vaultExists ? "success" : "danger"}
                />
                <DiagnosticItem label="Notas indexadas" value={String(diagnostics.notesIndexed)} />
                <DiagnosticItem
                  label="Última indexación"
                  value={diagnostics.lastIndexedAt ? new Date(diagnostics.lastIndexedAt).toLocaleString("es-AR") : "nunca"}
                />
                <DiagnosticItem label="Permiso de lectura" value={diagnostics.canRead ? "Sí" : "No"} />
                <DiagnosticItem label="Permiso de escritura" value={diagnostics.canWrite ? "Sí" : "No"} />
              </div>
            )}

            {syncDiagnostics && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded border border-border-subtle bg-background p-3 text-xs sm:grid-cols-4">
                <DiagnosticItem label="Total Markdown" value={String(syncDiagnostics.total)} />
                <DiagnosticItem label="Sincronizadas" value={String(syncDiagnostics.sincronizada)} tone="success" />
                <DiagnosticItem label="No encontrados" value={String(syncDiagnostics.noEncontrada)} tone={syncDiagnostics.noEncontrada > 0 ? "danger" : undefined} />
                <DiagnosticItem label="Conflictos" value={String(syncDiagnostics.conflicto)} tone={syncDiagnostics.conflicto > 0 ? "danger" : undefined} />
                <DiagnosticItem label="Errores" value={String(syncDiagnostics.error)} tone={syncDiagnostics.error > 0 ? "danger" : undefined} />
                <DiagnosticItem label="Sin sodiac_id" value={String(syncDiagnostics.sinSodiacId)} />
              </div>
            )}

            {summary && (
              <p className="mt-2 text-xs text-text-secondary">
                {summary.total} notas · {summary.created} nuevas · {summary.updated} actualizadas ·{" "}
                {summary.unchanged} sin cambios
              </p>
            )}
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}

            {openFailure && (
              <div className="mt-3 rounded border border-danger/40 bg-danger/5 p-3 text-xs">
                <p className="text-danger">
                  No se pudo abrir Obsidian automáticamente
                  {openFailure.error ? `: ${openFailure.error}` : "."}
                </p>
                <p className="mt-1 text-text-muted">
                  Esto suele pasar si Obsidian todavía no se ejecutó ni una vez en este equipo (el protocolo
                  obsidian:// se registra recién en el primer inicio) o si el vault no coincide.
                </p>
                <p className="mt-2 break-all rounded bg-background px-2 py-1 text-text-secondary">{openFailure.uri}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleCopyUri(openFailure.uri)}
                    className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
                  >
                    Copiar URI
                  </button>
                  <button
                    onClick={handleOpenFolder}
                    className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
                  >
                    Abrir carpeta en su lugar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {vaultPath && (
        <section className="mt-6 rounded border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Integridad académica
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            El vault ya tiene el currículo completo (preguntas, competencias, materias y temas con IDs
            explícitos en el frontmatter) pero Carrera solo tenía una muestra de prueba — ver
            docs/MASTER_SCHEDULE_MAP_AUDIT.md. Esto agrega lo que falte sin borrar ni modificar nada existente.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handlePreviewReconciliation}
              disabled={previewingReconciliation}
              className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {previewingReconciliation ? "Revisando…" : "Revisar candidatos"}
            </button>
            {reconciliationPreview && !reconciliationPreview.alreadyReconciled && (
              <button
                onClick={handleImportReconciliation}
                disabled={reconciling}
                className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent disabled:opacity-40"
              >
                {reconciling ? "Importando…" : "Importar currículo desde Obsidian"}
              </button>
            )}
            <button
              onClick={() => void handleOpenWizard()}
              disabled={loadingCandidates}
              className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {loadingCandidates ? "Cargando…" : showWizard ? "Ocultar revisión detallada" : "Revisar candidato por candidato"}
            </button>
          </div>

          {showWizard && candidates && (
            <div className="mt-3 rounded border border-border-subtle bg-background p-3">
              <p className="text-xs text-text-muted">
                Cada candidato aparece con su archivo, tipo detectado y relaciones. Los de confianza "alta" vienen
                pre-tildados; revisá los de confianza "media"/"baja" antes de aprobarlos — no se crea nada hasta
                que apretás "Importar seleccionados".
              </p>
              {candidates.length === 0 ? (
                <p className="mt-2 text-xs text-success">No hay candidatos nuevos detectados en el vault.</p>
              ) : (
                <>
                  <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                    {candidates.map((c) => (
                      <li
                        key={c.noteId}
                        className="flex items-start gap-2 rounded border border-border-subtle p-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedRefs.has(c.externalRef)}
                          onChange={() => toggleCandidate(c.externalRef)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded border border-border px-1.5 py-0.5 uppercase tracking-wide text-text-muted">
                              {c.detectedType}
                            </span>
                            <span className="text-text-primary">{c.title}</span>
                            <span
                              className={`ml-auto rounded px-1.5 py-0.5 uppercase tracking-wide ${
                                c.confidence === "alta"
                                  ? "text-success"
                                  : c.confidence === "media"
                                    ? "text-warning"
                                    : "text-danger"
                              }`}
                            >
                              confianza {c.confidence}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-text-muted">{c.vaultRelativePath}</p>
                          {c.materiaRef && <p className="text-text-muted">Materia: {c.materiaRef}</p>}
                          {(c.questionRefs.length > 0 || c.competencyRefs.length > 0) && (
                            <p className="text-text-muted">
                              Relaciones: {[...c.questionRefs, ...c.competencyRefs].join(", ")}
                            </p>
                          )}
                          {c.reason && <p className="mt-0.5 text-warning">{c.reason}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => void handleImportSelected()}
                    disabled={importingSelected || selectedRefs.size === 0}
                    className="mt-3 rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent disabled:opacity-40"
                  >
                    {importingSelected ? "Importando…" : `Importar seleccionados (${selectedRefs.size})`}
                  </button>
                </>
              )}
            </div>
          )}

          {reconciliationPreview && (
            <div className="mt-3 grid grid-cols-2 gap-3 rounded border border-border-subtle bg-background p-3 text-xs sm:grid-cols-4">
              <DiagnosticItem label="Preguntas por vincular" value={String(reconciliationPreview.questionsToLink)} />
              <DiagnosticItem label="Competencias por crear" value={String(reconciliationPreview.competenciesToCreate)} />
              <DiagnosticItem label="Materias por crear" value={String(reconciliationPreview.subjectsToCreate)} />
              <DiagnosticItem label="Temas por crear" value={String(reconciliationPreview.topicsToCreate)} />
              {reconciliationPreview.alreadyReconciled && (
                <p className="col-span-full text-success">Todo lo detectable en el vault ya está reconciliado.</p>
              )}
            </div>
          )}

          {reconciliationSummary && (
            <div className="mt-3 rounded border border-success/40 bg-success/5 p-3 text-xs text-text-secondary">
              <p className="font-semibold text-success">Importación completada.</p>
              <p className="mt-1">
                {reconciliationSummary.questionsLinked} preguntas vinculadas ·{" "}
                {reconciliationSummary.competenciesCreated} competencias creadas (
                {reconciliationSummary.competenciesSkipped} ya existían) · {reconciliationSummary.subjectsCreated}{" "}
                materias creadas ({reconciliationSummary.subjectsSkipped} ya existían) ·{" "}
                {reconciliationSummary.topicsCreated} temas creados ({reconciliationSummary.topicsSkipped} ya
                existían) · {reconciliationSummary.notesLinked} notas de Obsidian vinculadas por sodiac_id ·{" "}
                {reconciliationSummary.creditsRecalculated} materias con créditos recalculados según su cantidad de
                temas.
              </p>
              {reconciliationSummary.unresolved.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold text-warning">Sin resolver ({reconciliationSummary.unresolved.length}):</p>
                  <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                    {reconciliationSummary.unresolved.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="text-xs text-text-muted">
              Formaliza, dentro de cada materia, que el tema N requiere el tema N-1 (el mismo orden que ya usa el
              Cronograma Maestro) — antes solo era un cálculo implícito, esto lo vuelve una fila real en
              curriculum_dependency, que el Cronograma y el panel de "Ver requisitos" pasan a leer.
            </p>
            <button
              onClick={() => void handleGenerateDependencies()}
              disabled={generatingDependencies}
              className="mt-2 rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {generatingDependencies ? "Generando…" : "Generar prerequisitos secuenciales"}
            </button>
            {dependencyResult && (
              <p className="mt-2 text-xs text-text-secondary">
                {dependencyResult.created} prerequisito(s) creado(s) · {dependencyResult.skipped} ya existían.
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="text-xs text-text-muted">
              Diagnóstico completo de consistencia entre SQLite y el vault — solo lectura, no corrige nada
              automáticamente.
            </p>
            <button
              onClick={() => void handleAuditIntegrity()}
              disabled={auditingIntegrity}
              className="mt-2 rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {auditingIntegrity ? "Auditando…" : "Actualizar diagnóstico de integridad"}
            </button>

            {integrityAudit && (
              <div className="mt-3 space-y-2 rounded border border-border-subtle bg-background p-3 text-xs">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <DiagnosticItem label="Notas totales" value={String(integrityAudit.totalNotes)} />
                  <DiagnosticItem label="Con sodiac_id" value={String(integrityAudit.notesWithSodiacId)} tone="success" />
                  <DiagnosticItem label="Sin sodiac_id" value={String(integrityAudit.notesWithoutSodiacId)} />
                  <DiagnosticItem
                    label="Materias sin nota"
                    value={String(integrityAudit.subjectsWithoutNote.length)}
                    tone={integrityAudit.subjectsWithoutNote.length > 0 ? "danger" : "success"}
                  />
                  <DiagnosticItem
                    label="Temas sin nota"
                    value={String(integrityAudit.topicsWithoutNoteCount)}
                    tone={integrityAudit.topicsWithoutNoteCount > 0 ? "danger" : "success"}
                  />
                  <DiagnosticItem
                    label="Referencias rotas"
                    value={String(integrityAudit.brokenTopicCompetencyRefs + integrityAudit.brokenSubjectQuestionRefs)}
                    tone={integrityAudit.brokenTopicCompetencyRefs + integrityAudit.brokenSubjectQuestionRefs > 0 ? "danger" : "success"}
                  />
                </div>

                {integrityAudit.brokenTopicCompetencyRefs > 0 && (
                  <div>
                    <button
                      onClick={() => void handleClearBrokenRefs()}
                      disabled={clearingRefs}
                      className="rounded border border-danger px-3 py-1.5 text-danger disabled:opacity-40"
                    >
                      {clearingRefs
                        ? "Limpiando…"
                        : `Limpiar ${integrityAudit.brokenTopicCompetencyRefs} referencia(s) tema→competencia rota(s)`}
                    </button>
                    {integrityAudit.brokenSubjectQuestionRefs > 0 && (
                      <p className="mt-1 text-text-muted">
                        {integrityAudit.brokenSubjectQuestionRefs} referencia(s) materia→pregunta rota(s) — esa
                        columna no admite NULL, hay que reasignarlas a mano desde Carrera → materia.
                      </p>
                    )}
                  </div>
                )}

                {integrityAudit.duplicateExternalRefs.length > 0 && (
                  <div>
                    <p className="font-semibold text-danger">IDs duplicados:</p>
                    <ul className="mt-1 list-disc pl-4">
                      {integrityAudit.duplicateExternalRefs.map((d, i) => (
                        <li key={i}>
                          {d.table}: {d.externalRef} aparece {d.count} veces
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {integrityAudit.notesLookingLikeTopicsButUntyped.length > 0 && (
                  <div>
                    <p className="font-semibold text-warning">
                      Notas en 05_Temas/ sin type="tema" ({integrityAudit.notesLookingLikeTopicsButUntyped.length}):
                    </p>
                    <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
                      {integrityAudit.notesLookingLikeTopicsButUntyped.map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span className="truncate">{p}</span>
                          <button
                            onClick={() => void openNoteInObsidian(p)}
                            className="shrink-0 text-accent hover:underline"
                          >
                            Abrir nota
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {integrityAudit.subjectsWithoutNote.length === 0 &&
                  integrityAudit.topicsWithoutNoteCount === 0 &&
                  integrityAudit.duplicateExternalRefs.length === 0 &&
                  integrityAudit.notesLookingLikeTopicsButUntyped.length === 0 &&
                  integrityAudit.brokenTopicCompetencyRefs === 0 &&
                  integrityAudit.brokenSubjectQuestionRefs === 0 && (
                    <p className="text-success">Sin inconsistencias detectadas.</p>
                  )}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Integridad bibliográfica
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Diagnóstico del catálogo austrofinanciero y sus vínculos — solo lectura, no corrige nada automáticamente.
        </p>
        <button
          onClick={() => void handleAuditBibliography()}
          disabled={auditingBibliography}
          className="mt-2 rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {auditingBibliography ? "Auditando…" : "Actualizar diagnóstico bibliográfico"}
        </button>

        {bibliographyAudit && (
          <div className="mt-3 space-y-2 rounded border border-border-subtle bg-background p-3 text-xs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <DiagnosticItem label="Obras esperadas (catálogo)" value={String(bibliographyAudit.expectedAustrofinancialWorks)} />
              <DiagnosticItem
                label="Obras importadas"
                value={String(bibliographyAudit.importedAustrofinancialWorks)}
                tone={
                  bibliographyAudit.importedAustrofinancialWorks === bibliographyAudit.expectedAustrofinancialWorks
                    ? "success"
                    : "danger"
                }
              />
              <DiagnosticItem label="Total de recursos activos" value={String(bibliographyAudit.totalActiveResources)} />
              <DiagnosticItem
                label="Números de catálogo duplicados"
                value={String(bibliographyAudit.duplicateCatalogNumbers.length)}
                tone={bibliographyAudit.duplicateCatalogNumbers.length > 0 ? "danger" : "success"}
              />
              <DiagnosticItem label="Sin categoría" value={String(bibliographyAudit.resourcesWithoutCategory)} />
              <DiagnosticItem label="Sin año" value={String(bibliographyAudit.resourcesWithoutYear)} />
              <DiagnosticItem label="Sin acceso registrado" value={String(bibliographyAudit.resourcesWithoutAccess)} />
              <DiagnosticItem label="Sin materia/tema/proyecto" value={String(bibliographyAudit.resourcesWithoutAcademicLinks)} />
              <DiagnosticItem
                label="Vínculos huérfanos"
                value={String(bibliographyAudit.orphanedLinks)}
                tone={bibliographyAudit.orphanedLinks > 0 ? "danger" : "success"}
              />
            </div>

            {bibliographyAudit.duplicateCatalogNumbers.length > 0 && (
              <ul className="space-y-0.5 text-danger">
                {bibliographyAudit.duplicateCatalogNumbers.map((d) => (
                  <li key={d.catalogNumber}>
                    Catálogo #{d.catalogNumber}: {d.count} recursos con el mismo número.
                  </li>
                ))}
              </ul>
            )}

            {bibliographyAudit.orphanedLinks > 0 && (
              <button
                onClick={() => void handleClearOrphanedLinks()}
                disabled={clearingOrphanedLinks}
                className="rounded border border-danger px-3 py-1.5 text-danger disabled:opacity-40"
              >
                {clearingOrphanedLinks
                  ? "Limpiando…"
                  : `Limpiar ${bibliographyAudit.orphanedLinks} vínculo(s) huérfano(s)`}
              </button>
            )}

            {bibliographyAudit.duplicateCatalogNumbers.length === 0 &&
              bibliographyAudit.orphanedLinks === 0 &&
              bibliographyAudit.importedAustrofinancialWorks === bibliographyAudit.expectedAustrofinancialWorks && (
                <p className="text-success">Sin inconsistencias detectadas.</p>
              )}
          </div>
        )}
      </section>

      {showCreate && canCreate && (
        <form onSubmit={handleCreateNote} className="mt-4 space-y-2 rounded border border-border-subtle bg-surface p-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título de la nota"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="Ruta relativa dentro del vault, ej: SODIAC/formacion-de-precios.md"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          {createError && <p className="text-xs text-danger">{createError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="rounded border border-accent px-4 py-2 text-sm uppercase tracking-wide text-accent disabled:opacity-40"
          >
            {creating ? "Creando…" : "Crear nota"}
          </button>
        </form>
      )}

      {vaultPath && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Notas indexadas
            </h2>
            <input
              value={search}
              onChange={(e) => updateViewPrefs({ search: e.target.value })}
              placeholder="Buscar…"
              className="rounded border border-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          {filteredNotes.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              {notes.length === 0 ? "Todavía no indexaste el vault." : "Sin resultados."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
              {filteredNotes.map((note) => (
                <li key={note.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                  <div>
                    <p className="text-text-primary">{note.title ?? note.vault_relative_path}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {note.vault_relative_path}
                      {note.note_type ? ` · ${note.note_type}` : ""}
                      {note.status ? ` · ${note.status}` : ""}
                      {note.mastery_level !== null ? ` · dominio N${note.mastery_level}` : ""}
                    </p>
                    <p className={`mt-0.5 text-xs ${SYNC_STATE_COLOR[note.sync_state]}`}>
                      {SYNC_STATE_LABEL[note.sync_state]}
                      {note.last_synced_at && ` · ${new Date(note.last_synced_at).toLocaleString("es-AR")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {canCreate && note.sync_state !== "no_encontrada" && (
                      <button
                        onClick={() => handleOpenEditor(note)}
                        className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenNote(note)}
                      className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                    >
                      Abrir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editingNote && !conflict && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8" onClick={() => setEditingNote(null)}>
          <div className="w-full max-w-2xl rounded border border-border bg-surface-elevated p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg">Editar — {editingNote.title ?? editingNote.vault_relative_path}</h3>
            <p className="mt-1 text-xs text-text-muted">
              El cuerpo de la nota (Markdown, sin frontmatter) es la fuente canónica en el vault. Guardar escribe
              directamente el archivo.
            </p>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={16}
              className="mt-3 w-full rounded border border-border bg-background p-3 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
            />
            {saveError && <p className="mt-2 text-xs text-danger">{saveError}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSaveNote}
                disabled={saving}
                className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm uppercase tracking-wide text-accent disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => setEditingNote(null)}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8">
          <div className="w-full max-w-3xl rounded border border-danger/40 bg-surface-elevated p-5">
            <h3 className="font-display text-lg text-danger">Conflicto de sincronización</h3>
            <p className="mt-1 text-xs text-text-secondary">
              El archivo cambió en el vault (por ejemplo, editado desde Obsidian) desde la última vez que SODIAC lo
              leyó. Elegí qué versión conservar.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Versión de Obsidian (en disco)</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded border border-border-subtle bg-background p-2 text-xs text-text-primary">
                  {conflict.diskContent}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Versión de SODIAC (sin guardar)</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded border border-border-subtle bg-background p-2 text-xs text-text-primary">
                  {conflict.myBody}
                </pre>
              </div>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <button onClick={() => handleResolveConflict("mine")} className="rounded border border-accent px-3 py-1.5 uppercase tracking-wide text-accent">
                Conservar versión de SODIAC
              </button>
              <button onClick={() => handleResolveConflict("disk")} className="rounded border border-border px-3 py-1.5 text-text-secondary hover:border-accent hover:text-accent">
                Conservar versión de Obsidian
              </button>
              <button onClick={() => handleResolveConflict("cancel")} className="rounded border border-border px-3 py-1.5 text-text-secondary hover:border-danger hover:text-danger">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiagnosticItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | undefined;
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text-primary";
  return (
    <div>
      <p className="text-text-muted">{label}</p>
      <p className={`mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
