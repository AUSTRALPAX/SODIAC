import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ProjectRow, ResourceRow } from "@/database/types";
import { createResource, getProjectIdsForResource, linkResourceToProject, listResources, setReadingState } from "@/services/library";
import { listProjects } from "@/services/projects";

const RESOURCE_TYPES: ResourceRow["resource_type"][] = [
  "libro",
  "articulo",
  "informe",
  "video",
  "curso",
  "sitio",
  "dataset",
  "documento_interno",
  "archivo_local",
];

const READING_STATES: ResourceRow["reading_state"][] = [
  "pendiente",
  "consultando",
  "activo",
  "finalizado",
  "referencia",
  "descartado",
  "reemplazado",
];

const READING_STATE_LABEL: Record<ResourceRow["reading_state"], string> = {
  pendiente: "Pendiente",
  consultando: "Consultando",
  activo: "Activo",
  finalizado: "Finalizado",
  referencia: "Referencia",
  descartado: "Descartado",
  reemplazado: "Reemplazado",
};

export function LibraryPage() {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [linkedByResource, setLinkedByResource] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [resourceType, setResourceType] = useState<ResourceRow["resource_type"]>("libro");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const [res, projs] = await Promise.all([listResources(), listProjects()]);
    setResources(res);
    setProjects(projs);
    const links = new Map<string, string[]>();
    await Promise.all(
      res.map(async (r) => {
        links.set(r.id, await getProjectIdsForResource(r.id));
      }),
    );
    setLinkedByResource(links);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await createResource({ title: title.trim(), resource_type: resourceType, author: author || null, url: url || null });
      setTitle("");
      setAuthor("");
      setUrl("");
      setShowCreate(false);
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleStateChange(id: string, state: ResourceRow["reading_state"]) {
    await setReadingState(id, state);
    await refresh();
  }

  async function handleLink(resourceId: string, projectId: string) {
    if (!projectId) return;
    await linkResourceToProject(resourceId, projectId);
    await refresh();
  }

  const filtered = useMemo(
    () =>
      resources
        .filter((r) => !typeFilter || r.resource_type === typeFilter)
        .filter((r) => !stateFilter || r.reading_state === stateFilter),
    [resources, typeFilter, stateFilter],
  );

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="mx-auto max-w-3xl p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Biblioteca</h1>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent"
        >
          Nuevo recurso
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 space-y-2 rounded border border-border-subtle bg-surface p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Autor / fuente"
              className="rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as ResourceRow["resource_type"])}
              className="rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="URL (opcional)"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="rounded border border-accent px-4 py-2 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
          >
            {creating ? "Creando…" : "Crear recurso"}
          </button>
        </form>
      )}

      <div className="mt-6 flex gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Todos los tipos</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Todos los estados</option>
          {READING_STATES.map((s) => (
            <option key={s} value={s}>
              {READING_STATE_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="self-center text-xs text-text-muted">{filtered.length} recursos</span>
      </div>

      <ul className="mt-4 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
        {filtered.length === 0 && <li className="p-4 text-sm text-text-muted">Sin recursos para este filtro.</li>}
        {filtered.map((r) => {
          const linkedProjects = linkedByResource.get(r.id) ?? [];
          return (
            <li key={r.id} className="p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-text-primary">{r.title}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {r.resource_type.replace(/_/g, " ")}
                    {r.author ? ` · ${r.author}` : ""}
                  </p>
                  {linkedProjects.length > 0 && (
                    <p className="mt-0.5 text-xs text-accent">
                      Vinculado a: {linkedProjects.map((pid) => projects.find((p) => p.id === pid)?.title ?? pid).join(", ")}
                    </p>
                  )}
                </div>
                <select
                  value={r.reading_state}
                  onChange={(e) => handleStateChange(r.id, e.target.value as ResourceRow["reading_state"])}
                  className="shrink-0 rounded border border-border bg-background px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  {READING_STATES.map((s) => (
                    <option key={s} value={s}>
                      {READING_STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              {projects.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => handleLink(r.id, e.target.value)}
                  className="mt-2 rounded border border-border bg-background px-2 py-1 text-xs text-text-secondary focus:border-accent focus:outline-none"
                >
                  <option value="">Vincular a proyecto…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
