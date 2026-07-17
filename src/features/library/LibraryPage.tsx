import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { curriculumUnitsRepo, subjectsRepo, topicsRepo } from "@/database/entities";
import type { BibliographicSourceRow, CurriculumUnitRow, ObsidianNoteRow, ProjectRow, ResourceRow, SubjectRow, TopicRow } from "@/database/types";
import {
  createBibliographicNoteForResource,
  createResource,
  getLinksForResource,
  getNoteForResource,
  getProjectIdsForResource,
  linkResourceToProject,
  linkResourceToSubject,
  linkResourceToTopic,
  linkResourceToUnit,
  listResources,
  openResource,
  setReadingState,
  unlinkResource,
} from "@/services/library";
import { openNoteInObsidian } from "@/services/obsidian";
import { importLibraryInstitutionalBase, type LibraryImportSummary } from "@/services/libraryImport";
import {
  previewImport as previewAustrofinancialImport,
  runImport as runAustrofinancialImport,
  type AustrofinancialImportPreview,
  type AustrofinancialImportSummary,
} from "@/services/libraryAustrofinancialImport";
import { listProjects } from "@/services/projects";
import { getUsageCountForResource } from "@/services/resourceUsage";

const RELATION_TYPE_LABEL: Record<NonNullable<BibliographicSourceRow["relation_type"]>, string> = {
  bibliografia_principal: "Bibliografía principal",
  bibliografia_obligatoria: "Obligatoria",
  bibliografia_complementaria: "Complementaria",
  referencia: "Referencia",
  profundizacion: "Profundización",
  aplicacion: "Aplicación",
  consulta_tecnica: "Consulta técnica",
  fuente_historica: "Fuente histórica",
  lectura_opcional: "Lectura opcional",
  prerequisito: "Prerequisito",
  utilizada_en_proyecto: "Utilizada en proyecto",
  citada: "Citada",
  descartada: "Descartada",
};

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

/**
 * Orden de relevancia para "Ordenar por estado" (no alfabético): activo
 * primero (lo que estoy leyendo ahora), después consultando, después
 * pendiente, y al final los estados que ya no son foco de trabajo diario.
 */
const READING_STATE_RANK: Record<ResourceRow["reading_state"], number> = {
  activo: 0,
  consultando: 1,
  pendiente: 2,
  finalizado: 3,
  referencia: 4,
  descartado: 5,
  reemplazado: 6,
};

const READING_STATE_COLOR: Record<ResourceRow["reading_state"], string> = {
  activo: "text-success",
  consultando: "text-accent",
  pendiente: "text-text-secondary",
  finalizado: "text-text-muted",
  referencia: "text-text-muted",
  descartado: "text-text-muted",
  reemplazado: "text-text-muted",
};

const FUNCTION_LABEL: Record<NonNullable<ResourceRow["function_note"]>, string> = {
  estructural: "Estructural",
  didactica: "Didáctica",
  tecnica: "Técnica",
  caso: "Caso",
  critica: "Crítica",
  referencia: "Referencia",
};

type SortKey = "titulo" | "area" | "autor" | "reciente" | "estado";
type SortDirection = "asc" | "desc";

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [units, setUnits] = useState<CurriculumUnitRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [linkedByResource, setLinkedByResource] = useState<Map<string, string[]>>(new Map());
  const [bibliographyByResource, setBibliographyByResource] = useState<Map<string, BibliographicSourceRow[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [functionFilter, setFunctionFilter] = useState<string>("");
  const [availabilityFilter, setAvailabilityFilter] = useState<"" | "disponible" | "sin_archivo">("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("area");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showMinimalPathOnly, setShowMinimalPathOnly] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [resourceType, setResourceType] = useState<ResourceRow["resource_type"]>("libro");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<LibraryImportSummary | null>(null);
  const [austroPreview, setAustroPreview] = useState<AustrofinancialImportPreview | null>(null);
  const [austroSummary, setAustroSummary] = useState<AustrofinancialImportSummary | null>(null);
  const [previewingAustro, setPreviewingAustro] = useState(false);
  const [importingAustro, setImportingAustro] = useState(false);
  const [usageByResource, setUsageByResource] = useState<Map<string, number>>(new Map());
  const [noteByResource, setNoteByResource] = useState<Map<string, ObsidianNoteRow | null>>(new Map());
  const [creatingNoteFor, setCreatingNoteFor] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [res, projs, subs, uns, tops] = await Promise.all([
      listResources(),
      listProjects(),
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      curriculumUnitsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      topicsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
    ]);
    setResources(res);
    setProjects(projs);
    setSubjects(subs);
    setUnits(uns);
    setTopics(tops);
    const links = new Map<string, string[]>();
    const usage = new Map<string, number>();
    const bibliography = new Map<string, BibliographicSourceRow[]>();
    const notes = new Map<string, ObsidianNoteRow | null>();
    await Promise.all(
      res.map(async (r) => {
        links.set(r.id, await getProjectIdsForResource(r.id));
        usage.set(r.id, await getUsageCountForResource(r.id));
        bibliography.set(r.id, await getLinksForResource(r.id));
        notes.set(r.id, await getNoteForResource(r.id));
      }),
    );
    setLinkedByResource(links);
    setUsageByResource(usage);
    setBibliographyByResource(bibliography);
    setNoteByResource(notes);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Si se llega desde el Cronograma Maestro con ?tema=, prefill una sola vez.
  useEffect(() => {
    const tema = searchParams.get("tema");
    if (tema) {
      setTopicFilter(tema);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handlePreviewAustro() {
    setPreviewingAustro(true);
    setAustroSummary(null);
    try {
      setAustroPreview(await previewAustrofinancialImport());
    } finally {
      setPreviewingAustro(false);
    }
  }

  async function handleConfirmAustroImport() {
    setImportingAustro(true);
    try {
      setAustroSummary(await runAustrofinancialImport());
      setAustroPreview(await previewAustrofinancialImport());
      await refresh();
    } finally {
      setImportingAustro(false);
    }
  }

  async function handleLinkSubject(resourceId: string, subjectId: string) {
    if (!subjectId) return;
    await linkResourceToSubject(resourceId, subjectId);
    await refresh();
  }

  async function handleLinkUnit(resourceId: string, unitId: string) {
    if (!unitId) return;
    await linkResourceToUnit(resourceId, unitId);
    await refresh();
  }

  async function handleLinkTopic(resourceId: string, topicId: string) {
    if (!topicId) return;
    await linkResourceToTopic(resourceId, topicId);
    await refresh();
  }

  async function handleUnlink(bibliographicSourceId: string) {
    await unlinkResource(bibliographicSourceId);
    await refresh();
  }

  async function handleOpenOrCreateNote(resource: ResourceRow) {
    const existing = noteByResource.get(resource.id);
    if (existing) {
      await openNoteInObsidian(existing.vault_relative_path);
      return;
    }
    setCreatingNoteFor(resource.id);
    try {
      const note = await createBibliographicNoteForResource(resource);
      await refresh();
      if (note) await openNoteInObsidian(note.vault_relative_path);
    } finally {
      setCreatingNoteFor(null);
    }
  }

  const areas = useMemo(
    () => Array.from(new Set(resources.map((r) => r.area).filter((a): a is string => !!a))).sort(),
    [resources],
  );

  const categories = useMemo(
    () => Array.from(new Set(resources.map((r) => r.category).filter((c): c is string => !!c))).sort(),
    [resources],
  );

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const overviewStats = useMemo(() => {
    const total = resources.length;
    const iniciadas = resources.filter((r) => r.reading_state === "consultando" || r.reading_state === "activo").length;
    const completadas = resources.filter((r) => r.reading_state === "finalizado").length;
    const esenciales = resources.filter((r) => r.priority?.toLowerCase().includes("esencial")).length;
    const pdfsLocales = resources.filter((r) => !!r.file_path).length;
    const sinRelaciones = resources.filter((r) => (bibliographyByResource.get(r.id) ?? []).length === 0).length;
    return { total, iniciadas, completadas, esenciales, pdfsLocales, sinRelaciones };
  }, [resources, bibliographyByResource]);

  const filtered = useMemo(
    () =>
      resources
        .filter((r) => !typeFilter || r.resource_type === typeFilter)
        .filter((r) => !stateFilter || r.reading_state === stateFilter)
        .filter((r) => !areaFilter || r.area === areaFilter)
        .filter((r) => !categoryFilter || r.category === categoryFilter)
        .filter((r) => !functionFilter || r.function_note === functionFilter)
        .filter((r) => {
          if (availabilityFilter === "disponible") return !!(r.file_path || r.url);
          if (availabilityFilter === "sin_archivo") return !r.file_path && !r.url;
          return true;
        })
        .filter((r) => !showMinimalPathOnly || !!r.tags?.includes("ruta_minima_austrofinanciera"))
        .filter((r) => {
          if (!subjectFilter) return true;
          return (bibliographyByResource.get(r.id) ?? []).some((l) => l.subject_id === subjectFilter);
        })
        .filter((r) => {
          if (!topicFilter) return true;
          return (bibliographyByResource.get(r.id) ?? []).some((l) => l.topic_id === topicFilter);
        })
        .filter(
          (r) =>
            !search ||
            r.title.toLowerCase().includes(search.toLowerCase()) ||
            (r.author ?? "").toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          let cmp: number;
          if (sortKey === "titulo") cmp = a.title.localeCompare(b.title);
          else if (sortKey === "area") cmp = (a.area ?? "").localeCompare(b.area ?? "") || a.title.localeCompare(b.title);
          else if (sortKey === "autor") cmp = (a.author ?? "").localeCompare(b.author ?? "");
          else if (sortKey === "estado")
            cmp = READING_STATE_RANK[a.reading_state] - READING_STATE_RANK[b.reading_state] || a.title.localeCompare(b.title);
          else cmp = a.created_at.localeCompare(b.created_at);
          return sortDirection === "asc" ? cmp : -cmp;
        }),
    [
      resources,
      typeFilter,
      stateFilter,
      areaFilter,
      categoryFilter,
      functionFilter,
      availabilityFilter,
      showMinimalPathOnly,
      subjectFilter,
      topicFilter,
      bibliographyByResource,
      search,
      sortKey,
      sortDirection,
    ],
  );

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="mx-auto max-w-5xl p-10">
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
            onClick={handlePreviewAustro}
            disabled={previewingAustro}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {previewingAustro ? "Revisando…" : "Importar catálogo austrofinanciero"}
          </button>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent"
          >
            Nuevo recurso
          </button>
        </div>
      </div>

      {/* Vista general (sección 8 del pedido): tiles de conteos agregados. */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <OverviewTile label="Total de obras" value={overviewStats.total} />
        <OverviewTile label="Iniciadas" value={overviewStats.iniciadas} />
        <OverviewTile label="Completadas" value={overviewStats.completadas} />
        <OverviewTile label="Esenciales" value={overviewStats.esenciales} />
        <OverviewTile label="PDFs locales" value={overviewStats.pdfsLocales} />
        <OverviewTile label="Sin relaciones académicas" value={overviewStats.sinRelaciones} />
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

      {austroPreview && !austroSummary && (
        <div className="mt-3 rounded border border-border-subtle bg-surface p-3 text-xs text-text-secondary">
          <p className="font-semibold text-text-primary">
            Previsualización del catálogo austrofinanciero ({austroPreview.totalCatalog} obras)
          </p>
          <p className="mt-1">
            Nuevas: {austroPreview.newEntries.length} · Coincidencias exactas: {austroPreview.exactMatches.length} ·
            Coincidencias probables (revisar a mano): {austroPreview.probableMatches.length}
          </p>
          {austroPreview.probableMatches.length > 0 && (
            <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-warning">
              {austroPreview.probableMatches.map((m) => (
                <li key={m.catalogNumber}>
                  #{m.catalogNumber} "{m.title}" ({m.author}) podría ser la misma obra que "{m.existingTitle}" (
                  {m.existingAuthor || "sin autor"}) ya cargada — no se fusiona sola.
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={handleConfirmAustroImport}
            disabled={importingAustro}
            className="mt-2 rounded border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-accent disabled:opacity-40"
          >
            {importingAustro ? "Importando…" : "Confirmar importación"}
          </button>
        </div>
      )}

      {austroSummary && (
        <p className="mt-3 rounded border border-border-subtle bg-surface p-3 text-xs text-text-secondary">
          Esperadas: {austroSummary.expected} · Importadas: {austroSummary.imported} · Duplicados evitados:{" "}
          {austroSummary.duplicatesAvoided} · Actualizadas: {austroSummary.updated} · Errores:{" "}
          {austroSummary.errors.length}
          {austroSummary.backupId && <span className="block text-text-muted">Backup creado antes de importar.</span>}
          {austroSummary.errors.length > 0 && (
            <span className="mt-1 block text-danger">{austroSummary.errors.join(" · ")}</span>
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
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Toda categoría de catálogo</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Toda materia</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Todo tema</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showMinimalPathOnly}
            onChange={(e) => setShowMinimalPathOnly(e.target.checked)}
          />
          Solo ruta mínima austrofinanciera
        </label>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="area">Ordenar por área</option>
          <option value="titulo">Ordenar por título</option>
          <option value="autor">Ordenar por autor</option>
          <option value="reciente">Ordenar por más reciente</option>
          <option value="estado">Ordenar por estado de lectura</option>
        </select>
        <button
          onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
          title={sortDirection === "asc" ? "Ascendente" : "Descendente"}
          className="rounded border border-border px-2 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-accent"
        >
          {sortDirection === "asc" ? "↑ Ascendente" : "↓ Descendente"}
        </button>
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
                  className={`shrink-0 rounded border bg-background px-2 py-1 text-xs font-medium focus:border-accent focus:outline-none ${
                    r.reading_state === "activo"
                      ? "border-success"
                      : r.reading_state === "consultando"
                        ? "border-accent"
                        : "border-border"
                  } ${READING_STATE_COLOR[r.reading_state]}`}
                >
                  {READING_STATES.map((s) => (
                    <option key={s} value={s}>
                      {READING_STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              {expanded && (
                <div className="mt-2 space-y-2 rounded border border-border-subtle bg-background p-3 text-xs text-text-secondary">
                  <p>Estado de evaluación institucional: {r.evaluation_state ?? "sin registrar"}</p>
                  {r.notes && <p>Función inicial: {r.notes}</p>}
                  {r.catalog_number != null && (
                    <p>
                      Catálogo #{r.catalog_number} · {r.category ?? "sin categoría"} · {r.original_year ?? "sin año"} ·{" "}
                      {r.access_label ?? "sin acceso registrado"}
                      {r.tags?.includes("ruta_minima_austrofinanciera") && (
                        <span className="ml-2 rounded border border-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                          Ruta mínima
                        </span>
                      )}
                    </p>
                  )}
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

                  <div className="flex items-center gap-2">
                    <p>Nota de Obsidian: {noteByResource.get(r.id) ? "vinculada" : "sin vincular"}</p>
                    <button
                      onClick={() => void handleOpenOrCreateNote(r)}
                      disabled={creatingNoteFor === r.id}
                      className="shrink-0 rounded border border-accent px-2 py-0.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10 disabled:opacity-40"
                    >
                      {creatingNoteFor === r.id
                        ? "Creando…"
                        : noteByResource.get(r.id)
                          ? "Abrir nota"
                          : "Crear nota bibliográfica"}
                    </button>
                  </div>

                  <div className="border-t border-border-subtle pt-2">
                    <p className="font-semibold text-text-primary">Materias, unidades y temas vinculados</p>
                    {(bibliographyByResource.get(r.id) ?? []).filter((l) => l.subject_id || l.curriculum_unit_id || l.topic_id)
                      .length === 0 ? (
                      <p className="mt-1 text-text-muted">Sin vínculos académicos todavía.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {(bibliographyByResource.get(r.id) ?? [])
                          .filter((l) => l.subject_id || l.curriculum_unit_id || l.topic_id)
                          .map((l) => (
                            <li key={l.id} className="flex items-center justify-between gap-2">
                              <span>
                                {l.subject_id && `Materia: ${subjectById.get(l.subject_id)?.title ?? l.subject_id}`}
                                {l.curriculum_unit_id && `Unidad: ${unitById.get(l.curriculum_unit_id)?.title ?? l.curriculum_unit_id}`}
                                {l.topic_id && `Tema: ${topicById.get(l.topic_id)?.title ?? l.topic_id}`}
                                {l.relation_type && ` · ${RELATION_TYPE_LABEL[l.relation_type]}`}
                              </span>
                              <button
                                onClick={() => void handleUnlink(l.id)}
                                className="shrink-0 text-danger hover:underline"
                              >
                                Quitar
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                {subjects.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => handleLinkSubject(r.id, e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs text-text-secondary focus:border-accent focus:outline-none"
                  >
                    <option value="">Vincular a materia…</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                )}
                {units.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => handleLinkUnit(r.id, e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs text-text-secondary focus:border-accent focus:outline-none"
                  >
                    <option value="">Vincular a unidad…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.title}
                      </option>
                    ))}
                  </select>
                )}
                {topics.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => handleLinkTopic(r.id, e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs text-text-secondary focus:border-accent focus:outline-none"
                  >
                    <option value="">Vincular a tema…</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                )}
                {projects.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => handleLink(r.id, e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs text-text-secondary focus:border-accent focus:outline-none"
                  >
                    <option value="">Vincular a proyecto…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OverviewTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border-subtle bg-surface p-3">
      <p className="font-display text-2xl text-text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}
