import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createNoteFromTemplate,
  getPermissionMode,
  getVaultPath,
  indexVault,
  listIndexedNotes,
  openNoteInObsidian,
  openVaultInObsidian,
  pickVaultFolder,
  setPermissionMode,
  setVaultPath,
  type IndexSummary,
} from "@/services/obsidian";
import type { ObsidianNoteRow, ObsidianPermissionMode } from "@/database/types";

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

  const [showCreate, setShowCreate] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
            {vaultPath ? "Cambiar" : "Elegir carpeta"}
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
                onClick={handleIndex}
                disabled={indexing}
                className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent disabled:opacity-40"
              >
                {indexing ? "Indexando…" : "Indexar vault"}
              </button>
              <button
                onClick={() => openVaultInObsidian()}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
              >
                Abrir vault en Obsidian
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
            {summary && (
              <p className="mt-2 text-xs text-text-secondary">
                {summary.total} notas · {summary.created} nuevas · {summary.updated} actualizadas ·{" "}
                {summary.unchanged} sin cambios
              </p>
            )}
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
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
                  </div>
                  <button
                    onClick={() => openNoteInObsidian(note.vault_relative_path)}
                    className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                  >
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
