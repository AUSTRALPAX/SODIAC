import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ProjectRow, ResourceRow } from "@/database/types";
import { createResource, getProjectIdsForResource, linkResourceToProject, listResources, openResource, setReadingState } from "@/services/library";
import { importLibraryInstitutionalBase, type LibraryImportSummary } from "@/services/libraryImport";
import { listProjects } from "@/services/projects";
import { getUsageCountForResource } from "@/services/resourceUsage";

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

const FUNCTION_LABEL: Record<NonNullable<ResourceRow["function_note"]>, string> = {
  estructural: "Estructural",
  didactica: "Didáctica",
  tecnica: "Técnica",
  caso: "Caso",
  critica: "Crítica",
  referencia: "Referencia",
};

type SortKey = "titulo" | "area" | "autor" | "reciente";

export function LibraryPage() {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [linkedByResource, setLinkedByResource] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [functionFilter, setFunctionFilter] = useState<string>("");
  const [availabilityFilter, setAvailabilityFilter] = useState<"" | "disponible" | "sin_archivo">("");
  const [sortKey, setSortKey] = useState<SortKey>("area");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [resourceType, setResourceType] = useState<ResourceRow["resource_type"]>("libro");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<LibraryImportSummary | null>(null);
  const [usageByResource, setUsageByResource] = useState<Map<string, number>>(new Map());
  const [openError, setOpenError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [res, projs] = await Promise.all([listResources(), listProjects()]);
    setResources(res);
    setProjects(projs);
    const links = new Map<string, string[]>();
    const usage = new Map<string, number>();
    await Promise.all(
      res.map(async (r) => {
        links.set(r.id, await getProjectIdsForResource(r.id));
        usage.set(r.id, await getUsageCountForResource(r.id));
      }),
    );
    setLinkedByResource(links);
    setUsageByResource(usage);
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

  async function handleOpen(r: ResourceRow) {
    setOpenError(null);
    try {
      await openResource(r);
      await refresh();
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleImport() {
    setImporting(true);
    try {
      setImportSummary(await importLibraryInstitutionalBase());
      await refresh();
    } finally {
      setImporting(false);
    }
  }

  const areas = useMemo(
    () => Array.from(new Set(resources.map((r) => r.area).filter((a): a is string => !!a))).sort(),
    [resources],
  );

  const filtered = useMemo(
    () =>
      resources
        .filter((r) => !typeFilter || r.resource_type === typeFilter)
        .filter((r) => !stateFilter || r.reading_state === stateFilter)
        .filter((r) => !areaFilter || r.area === areaFilter)
        .filter((r) => !functionFilter || r.function_note === functionFilter)
        .filter((r) => {
          if (availabilityFilter === "disponible") return !!(r.file_path || r.url);
          if (availabilityFilter === "sin_archivo") return !r.file_path && !r.url;
          return true;
        })
        .filter(
          (r) =>
            !search ||
            r.title.toLowerCase().includes(search.toLowerCase()) ||
            (r.author ?? "").toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          if (sortKey === "titulo") return a.title.localeCompare(b.title);
          if (sortKey === "area") return (a.area ?? "").localeCompare(b.area ?? "") || a.title.localeCompare(b.title);
          if (sortKey === "autor") return (a.author ?? "").localeCompare(b.author ?? "");
          return b.created_at.localeCompare(a.created_at);
        }),
    [resources, typeFilter, stateFilter, areaFilter, functionFilter, availabilityFilter, search, sortKey],
  );

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="mx-auto max-w-3xl p-10">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl">Biblioteca</h1>
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            disabled={importing}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {importing ? "Importando…" : "Importar Base Bibliográfica Inicial"}
          </button>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent"
          >
            Nuevo recurso
          </button>
        </div>
      </div>

      {openError && <p className="mt-3 text-xs text-danger">No se pudo abrir el recurso: {openError}</p>}

      {importSummary && (
        <p className="mt-3 rounded border border-border-subtle bg-surface p-3 text-xs text-text-secondary">
          Esperados: {importSummary.expected} · Importados: {importSummary.imported} · Ya existentes:{" "}
          {importSummary.alreadyExisting} · Actualizados: {importSummary.updated} · Duplicados evitados:{" "}
          {importSummary.duplicatesAvoided} · Errores: {importSummary.errors.length}
          {importSummary.errors.length > 0 && (
            <span className="mt-1 block text-danger">{importSummary.errors.join(" · ")}</span>
          )}
        </p>
      )}

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

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o autor…"
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
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
          value={functionFilter}
          onChange={(e) => setFunctionFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Toda función</option>
          {(Object.keys(FUNCTION_LABEL) as (keyof typeof FUNCTION_LABEL)[]).map((f) => (
            <option key={f} value={f}>
              {FUNCTION_LABEL[f]}
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
        <select
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value as typeof availabilityFilter)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Toda disponibilidad</option>
          <option value="disponible">Con archivo o URL</option>
          <option value="sin_archivo">Sin archivo asociado</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="area">Ordenar por área</option>
          <option value="titulo">Ordenar por título</option>
          <option value="autor">Ordenar por autor</option>
          <option value="reciente">Ordenar por más reciente</option>
        </select>
        <span className="self-center text-xs text-text-muted">{filtered.length} recursos</span>
      </div>

      <ul className="mt-4 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
        {filtered.length === 0 && <li className="p-4 text-sm text-text-muted">Sin recursos para este filtro.</li>}
        {filtered.map((r) => {
          const linkedProjects = linkedByResource.get(r.id) ?? [];
          const expanded = expandedId === r.id;
          return (
            <li key={r.id} className="p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setExpandedId(expanded ? null : r.id)}>
                  <p className="text-text-primary">{r.title}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {r.area && `${r.area} · `}
                    {r.resource_type.replace(/_/g, " ")}
                    {r.author ? ` · ${r.author}` : ""}
                    {r.function_note ? ` · ${FUNCTION_LABEL[r.function_note]}` : ""}
                  </p>
                  {linkedProjects.length > 0 && (
                    <p className="mt-0.5 text-xs text-accent">
                      Vinculado a: {linkedProjects.map((pid) => projects.find((p) => p.id === pid)?.title ?? pid).join(", ")}
                    </p>
                  )}
                </button>
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

              {expanded && (
                <div className="mt-2 space-y-1 rounded border border-border-subtle bg-background p-3 text-xs text-text-secondary">
                  <p>Estado de evaluación institucional: {r.evaluation_state ?? "sin registrar"}</p>
                  {r.notes && <p>Función inicial: {r.notes}</p>}
                  <div className="flex items-center gap-2">
                    <p>
                      Disponibilidad:{" "}
                      {r.file_path ? `archivo local (${r.file_path})` : r.url ? `enlace (${r.url})` : "sin archivo asociado todavía"}
                    </p>
                    {(r.file_path || r.url) && (
                      <button
                        onClick={() => void handleOpen(r)}
                        className="shrink-0 rounded border border-accent px-2 py-0.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10"
                      >
                        Abrir
                      </button>
                    )}
                  </div>
                  <p className="text-text-muted">Consultas registradas: {usageByResource.get(r.id) ?? 0}</p>
                </div>
              )}

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
