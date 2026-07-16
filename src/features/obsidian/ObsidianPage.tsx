import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  const [search, setSearch] = useState("");
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
              onChange={(e) => setSearch(e.target.value)}
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
