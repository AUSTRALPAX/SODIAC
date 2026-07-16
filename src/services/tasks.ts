import { taskHistoryRepo, tasksRepo } from "@/database/entities";
import { completeTaskOrMilestone } from "@/services/completionXp";
import type { TaskHistoryRow, TaskRow } from "@/database/types";

/**
 * Capa de negocio sobre `task`. El repositorio genérico alcanza para CRUD
 * simple, pero reprogramar o completar una tarea debe conservar su
 * historial (prompt maestro §14: "una tarea incompleta debe conservar
 * historial; no borrar el registro anterior al reprogramarla").
 */

const now = () => new Date().toISOString();

export interface NewTaskInput {
  title: string;
  description?: string | null;
  due_at?: string | null;
  priority?: TaskRow["priority"];
  task_type?: TaskRow["task_type"];
  project_id?: string | null;
  study_session_id?: string | null;
  subject_id?: string | null;
  topic_id?: string | null;
  milestone_id?: string | null;
}

export async function createTask(input: NewTaskInput): Promise<TaskRow> {
  const row: TaskRow = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description ?? null,
    due_at: input.due_at ?? null,
    priority: input.priority ?? "media",
    task_type: input.task_type ?? "estudio",
    project_id: input.project_id ?? null,
    study_session_id: input.study_session_id ?? null,
    subject_id: input.subject_id ?? null,
    topic_id: input.topic_id ?? null,
    milestone_id: input.milestone_id ?? null,
    completed_at: null,
    status: "pendiente",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: now(),
    updated_at: now(),
    archived_at: null,
  };
  return tasksRepo.insert(row);
}

export async function listActiveTasks(): Promise<TaskRow[]> {
  return tasksRepo.list({
    where: "archived_at IS NULL AND status != 'completada'",
    orderBy: "due_at IS NULL, due_at ASC",
  });
}

export async function listAllTasks(): Promise<TaskRow[]> {
  return tasksRepo.list({ where: "archived_at IS NULL", orderBy: "due_at IS NULL, due_at ASC" });
}

async function recordHistory(
  taskId: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  reason?: string,
): Promise<void> {
  const entry: TaskHistoryRow = {
    id: crypto.randomUUID(),
    task_id: taskId,
    changed_field: field,
    old_value: oldValue,
    new_value: newValue,
    changed_at: now(),
    reason: reason ?? null,
  };
  await taskHistoryRepo.insert(entry);
}

export async function rescheduleTask(id: string, newDueAt: string | null, reason?: string): Promise<void> {
  const task = await tasksRepo.getById(id);
  if (!task) throw new Error("La tarea no existe.");
  await recordHistory(id, "due_at", task.due_at, newDueAt, reason);
  await tasksRepo.update(id, { due_at: newDueAt });
}

/**
 * Completar una tarea siempre pasa por el mismo motor de XP que usa el
 * cierre de sesión (`completeTaskOrMilestone`) — así da lo mismo completarla
 * desde Planificación, desde Proyectos o desde el modal de cierre de
 * sesión: otorga XP idéntico si la tarea tiene `subject_id` (o ninguno si
 * es una tarea administrativa sin materia).
 */
export async function completeTask(id: string): Promise<void> {
  const task = await tasksRepo.getById(id);
  if (!task) throw new Error("La tarea no existe.");
  await recordHistory(id, "status", task.status, "completada");
  await completeTaskOrMilestone("task", id, task.subject_id, task.title);
}

export async function reopenTask(id: string): Promise<void> {
  const task = await tasksRepo.getById(id);
  if (!task) throw new Error("La tarea no existe.");
  await recordHistory(id, "status", task.status, "pendiente");
  await tasksRepo.update(id, { status: "pendiente", completed_at: null });
}

export async function getTaskHistory(taskId: string): Promise<TaskHistoryRow[]> {
  return taskHistoryRepo.list({ where: "task_id = ?", params: [taskId], orderBy: "changed_at DESC" });
}
