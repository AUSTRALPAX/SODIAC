import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { bibliographicSourcesRepo, resourcesRepo } from "@/database/entities";
import { recordResourceUsage } from "@/services/resourceUsage";
import type { ResourceRow } from "@/database/types";

const now = () => new Date().toISOString();

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
  };
  return resourcesRepo.insert(row);
}

export async function listResources(): Promise<ResourceRow[]> {
  return resourcesRepo.list({ where: "archived_at IS NULL", orderBy: "created_at DESC" });
}

export async function setReadingState(id: string, state: ResourceRow["reading_state"]): Promise<void> {
  await resourcesRepo.update(id, { reading_state: state });
}

export async function linkResourceToProject(resourceId: string, projectId: string): Promise<void> {
  await bibliographicSourcesRepo.insert({
    id: crypto.randomUUID(),
    resource_id: resourceId,
    fundamental_question_id: null,
    competency_id: null,
    subject_id: null,
    topic_id: null,
    project_id: projectId,
    study_session_id: null,
    obsidian_note_id: null,
    created_at: now(),
  });
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
