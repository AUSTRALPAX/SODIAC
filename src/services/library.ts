import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { getDb } from "@/database/client";
import { bibliographicSourcesRepo, obsidianNotesRepo, resourcesRepo } from "@/database/entities";
import { recordResourceUsage } from "@/services/resourceUsage";
import { MINIMAL_PATH_TAG } from "@/services/libraryAustrofinancialImport";
import { createNoteFromTemplate, indexVault } from "@/services/obsidian";
import type { BibliographicRelationType, BibliographicSourceRow, ObsidianNoteRow, ResourceRow } from "@/database/types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const now = () => new Date().toISOString();

export interface LinkResourceMeta {
  relationType?: BibliographicRelationType | null;
  importance?: number | null;
  readingOrder?: number | null;
  suggestedChapters?: string | null;
  notes?: string | null;
}

type LinkTargetField = "subject_id" | "curriculum_unit_id" | "topic_id" | "project_id";

async function linkResourceToEntity(
  resourceId: string,
  targetField: LinkTargetField,
  targetId: string,
  meta: LinkResourceMeta,
): Promise<void> {
  await bibliographicSourcesRepo.insert({
    id: crypto.randomUUID(),
    resource_id: resourceId,
    fundamental_question_id: null,
    competency_id: null,
    subject_id: null,
    topic_id: null,
    project_id: null,
    study_session_id: null,
    obsidian_note_id: null,
    curriculum_unit_id: null,
    [targetField]: targetId,
    relation_type: meta.relationType ?? null,
    importance: meta.importance ?? null,
    reading_order: meta.readingOrder ?? null,
    suggested_chapters: meta.suggestedChapters ?? null,
    notes: meta.notes ?? null,
    linked_at: now(),
    created_at: now(),
  } as BibliographicSourceRow);
}

export interface NewResourceInput {
  title: string;
  resource_type: ResourceRow["resource_type"];
  author?: string | null;
  function_note?: ResourceRow["function_note"];
  reading_state?: ResourceRow["reading_state"];
  priority?: string | null;
  url?: string | null;
  area?: string | null;
}

export async function createResource(input: NewResourceInput): Promise<ResourceRow> {
  const row: ResourceRow = {
    id: crypto.randomUUID(),
    title: input.title,
    resource_type: input.resource_type,
    author: input.author ?? null,
    function_note: input.function_note ?? null,
    reading_state: input.reading_state ?? "pendiente",
    priority: input.priority ?? null,
    file_path: null,
    url: input.url ?? null,
    area: input.area ?? null,
    evaluation_state: null,
    status: "activo",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: now(),
    updated_at: now(),
    archived_at: null,
    catalog_number: null,
    original_year: null,
    category: null,
    access_label: null,
    access_type: null,
    source_document: null,
    source_page: null,
    import_batch: null,
  };
  return resourcesRepo.insert(row);
}

export async function listResources(): Promise<ResourceRow[]> {
  return resourcesRepo.list({ where: "archived_at IS NULL", orderBy: "created_at DESC" });
}

/** Colección "Ruta mínima austrofinanciera" (12 títulos) — un tag reconocido en `resource.tags`, no una tabla nueva. */
export async function listMinimalPathResources(): Promise<ResourceRow[]> {
  const rows = await resourcesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" });
  return rows.filter((r) => r.tags?.includes(MINIMAL_PATH_TAG));
}

export async function setReadingState(id: string, state: ResourceRow["reading_state"]): Promise<void> {
  await resourcesRepo.update(id, { reading_state: state });
}

/** Actualiza el enlace y/o el archivo local de un recurso desde la ficha expandida de Biblioteca. */
export async function updateResourceAccess(
  id: string,
  patch: { url?: string | null; filePath?: string | null },
): Promise<void> {
  const update: Partial<ResourceRow> = { updated_at: now() };
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.filePath !== undefined) update.file_path = patch.filePath;
  await resourcesRepo.update(id, update);
}

export async function linkResourceToProject(
  resourceId: string,
  projectId: string,
  meta: LinkResourceMeta = {},
): Promise<void> {
  await linkResourceToEntity(resourceId, "project_id", projectId, meta);
}

/**
 * A diferencia de proyecto (vínculo único históricamente), un libro puede
 * vincularse con varias materias/unidades/temas a la vez — cada llamada
 * agrega una fila nueva en `bibliographic_source`, no reemplaza la anterior.
 */
export async function linkResourceToSubject(
  resourceId: string,
  subjectId: string,
  meta: LinkResourceMeta = {},
): Promise<void> {
  await linkResourceToEntity(resourceId, "subject_id", subjectId, meta);
}

export async function linkResourceToUnit(
  resourceId: string,
  unitId: string,
  meta: LinkResourceMeta = {},
): Promise<void> {
  await linkResourceToEntity(resourceId, "curriculum_unit_id", unitId, meta);
}

export async function linkResourceToTopic(
  resourceId: string,
  topicId: string,
  meta: LinkResourceMeta = {},
): Promise<void> {
  await linkResourceToEntity(resourceId, "topic_id", topicId, meta);
}

/** Borra el vínculo — nunca toca el recurso, la materia/unidad/tema/proyecto. */
export async function unlinkResource(bibliographicSourceId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM bibliographic_source WHERE id = ?", [bibliographicSourceId]);
}

/**
 * Abre el archivo local o el enlace de un recurso y registra el evento de
 * uso — el contador de "consultas" solo crece por una apertura explícita
 * como esta, nunca por rerenderizar la pantalla de Biblioteca.
 */
export async function openResource(resource: ResourceRow): Promise<void> {
  if (resource.file_path) {
    await openPath(resource.file_path);
  } else if (resource.url) {
    await openUrl(resource.url);
  } else {
    throw new Error("Este recurso no tiene archivo local ni enlace configurado.");
  }
  await recordResourceUsage({ resourceId: resource.id, action: "abierto" });
}

export async function getProjectIdsForResource(resourceId: string): Promise<string[]> {
  const rows = await bibliographicSourcesRepo.list({
    where: "resource_id = ? AND project_id IS NOT NULL",
    params: [resourceId],
  });
  return rows.map((r) => r.project_id!);
}

/** Todos los vínculos de un recurso (materia/unidad/tema/proyecto), para la ficha expandida en Biblioteca. */
export async function getLinksForResource(resourceId: string): Promise<BibliographicSourceRow[]> {
  return bibliographicSourcesRepo.list({ where: "resource_id = ?", params: [resourceId] });
}

export async function getBibliographyForSubject(subjectId: string): Promise<BibliographicSourceRow[]> {
  return bibliographicSourcesRepo.list({ where: "subject_id = ?", params: [subjectId] });
}

export async function getBibliographyForUnit(unitId: string): Promise<BibliographicSourceRow[]> {
  return bibliographicSourcesRepo.list({ where: "curriculum_unit_id = ?", params: [unitId] });
}

export async function getBibliographyForTopic(topicId: string): Promise<BibliographicSourceRow[]> {
  return bibliographicSourcesRepo.list({ where: "topic_id = ?", params: [topicId] });
}

/** La nota de Obsidian ya vinculada a este recurso (sodiac_id = resource.id), si existe. */
export async function getNoteForResource(resourceId: string): Promise<ObsidianNoteRow | null> {
  const notes = await obsidianNotesRepo.list({ where: "sodiac_id = ?", params: [resourceId] });
  return notes[0] ?? null;
}

/**
 * Crea una nota bibliográfica nueva en el vault, vinculada al recurso vía
 * `sodiac_id` (mismo mecanismo que ya usa Sesiones para notas de tema —
 * `createNoteFromTemplate` + reindexar). No sobrescribe una nota existente.
 */
export async function createBibliographicNoteForResource(resource: ResourceRow): Promise<ObsidianNoteRow | null> {
  const relativePath = `05_Temas/sodiac-bib-${slugify(resource.title)}.md`;
  await createNoteFromTemplate(
    relativePath,
    {
      sodiac_id: resource.id,
      tipo: "nota-bibliografica",
      autores: resource.author,
      titulo: resource.title,
      anio: resource.original_year,
      estado_lectura: resource.reading_state,
      url_fuente: resource.url,
      archivo_local: resource.file_path,
    },
    `# ${resource.title}\n\n${resource.author ? `Autor: ${resource.author}\n\n` : ""}Notas de lectura.\n`,
  );
  await indexVault();
  return getNoteForResource(resource.id);
}
