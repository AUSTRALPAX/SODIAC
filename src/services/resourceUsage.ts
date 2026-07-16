import { resourceUsageEventsRepo } from "@/database/entities";
import type { ResourceUsageEventRow } from "@/database/types";

const now = () => new Date().toISOString();

export interface RecordResourceUsageInput {
  resourceId: string;
  action: ResourceUsageEventRow["action"];
  sessionId?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  projectId?: string | null;
  noteId?: string | null;
}

/**
 * Registra un evento de uso de un recurso bibliográfico. Se llama
 * explícitamente desde la acción que lo dispara (abrir el archivo/enlace,
 * vincularlo a un proyecto, citarlo) — nunca desde un rerender de pantalla,
 * para no inflar el contador de consultas artificialmente.
 */
export async function recordResourceUsage(input: RecordResourceUsageInput): Promise<ResourceUsageEventRow> {
  const row: ResourceUsageEventRow = {
    id: crypto.randomUUID(),
    resource_id: input.resourceId,
    session_id: input.sessionId ?? null,
    subject_id: input.subjectId ?? null,
    topic_id: input.topicId ?? null,
    project_id: input.projectId ?? null,
    note_id: input.noteId ?? null,
    action: input.action,
    occurred_at: now(),
  };
  await resourceUsageEventsRepo.insert(row);
  return row;
}

export async function listUsageForResource(resourceId: string): Promise<ResourceUsageEventRow[]> {
  return resourceUsageEventsRepo.list({ where: "resource_id = ?", params: [resourceId], orderBy: "occurred_at DESC" });
}

export async function getUsageCountForResource(resourceId: string): Promise<number> {
  const rows = await listUsageForResource(resourceId);
  return rows.length;
}

export async function getLastUsageForResource(resourceId: string): Promise<ResourceUsageEventRow | null> {
  const rows = await listUsageForResource(resourceId);
  return rows[0] ?? null;
}

export async function listUsageForSubject(subjectId: string): Promise<ResourceUsageEventRow[]> {
  return resourceUsageEventsRepo.list({ where: "subject_id = ?", params: [subjectId], orderBy: "occurred_at DESC" });
}
