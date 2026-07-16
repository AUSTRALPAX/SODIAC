import {
  projectMilestonesRepo,
  projectsRepo,
  subjectsRepo,
  tasksRepo,
  topicsRepo,
} from "@/database/entities";
import type { ProjectMilestoneRow, SubjectRow, TaskRow, TopicRow } from "@/database/types";
import { awardXp, previewAwardXp, type AwardXpResult } from "@/services/xp";

const now = () => new Date().toISOString();

/**
 * XP directo por finalización cotidiana (tarea/hito, tema, materia) — sin
 * exportar JSON ni pasar por ChatGPT. Todo se otorga con `score100: 100`
 * (crédito completo) contra el presupuesto de finalización de la materia
 * (`completion_budgeted_xp` / `COMPLETION_CATEGORY_WEIGHTS`), separado del
 * presupuesto de trabajo calificado.
 *
 * El presupuesto de cada categoría se reparte en partes iguales entre todos
 * los elementos activos que compiten por ella en la materia (`itemsSharing*`
 * más abajo) — así una materia con muchos temas nunca puede otorgar más XP
 * que su `completion_budgeted_xp` total, sin importar cuántos temas tenga.
 */
const COMPLETION_SCORE = 100;

export type CompletionKind = "task" | "milestone" | "topic" | "subject";

export interface CompletionPreviewItem {
  kind: CompletionKind;
  id: string;
  label: string;
  amount: number;
  alreadyAwarded: boolean;
}

async function countTopicsForSubject(subjectId: string): Promise<number> {
  const topics = await topicsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId] });
  return Math.max(1, topics.length);
}

/** Tareas con `subject_id` propio + hitos de proyectos vinculados a la materia. */
async function countTasksAndMilestonesForSubject(subjectId: string): Promise<number> {
  const tasks = await tasksRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId] });
  const subjectProjects = await projectsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId] });
  let milestoneCount = 0;
  for (const project of subjectProjects) {
    const milestones = await projectMilestonesRepo.list({ where: "project_id = ?", params: [project.id] });
    milestoneCount += milestones.length;
  }
  return Math.max(1, tasks.length + milestoneCount);
}

async function previewTaskOrMilestone(
  kind: "task" | "milestone",
  id: string,
  subjectId: string | null,
  label: string,
): Promise<CompletionPreviewItem> {
  const itemsSharingCategory = subjectId ? await countTasksAndMilestonesForSubject(subjectId) : 1;
  const preview = await previewAwardXp({
    sourceType: kind === "task" ? "task_completion" : "milestone_completion",
    sourceId: id,
    subjectId,
    category: "finalizacion_tarea_hito",
    score100: COMPLETION_SCORE,
    reason: label,
    itemsSharingCategory,
  });
  return { kind, id, label, amount: preview.diff, alreadyAwarded: preview.diff <= 0 && preview.alreadyAwardedForKey > 0 };
}

export async function previewTaskCompletion(task: TaskRow): Promise<CompletionPreviewItem> {
  return previewTaskOrMilestone("task", task.id, task.subject_id, task.title);
}

export async function previewMilestoneCompletion(
  milestone: ProjectMilestoneRow,
  subjectId: string | null,
): Promise<CompletionPreviewItem> {
  return previewTaskOrMilestone("milestone", milestone.id, subjectId, milestone.title);
}

export async function previewTopicCompletion(topic: TopicRow): Promise<CompletionPreviewItem> {
  const itemsSharingCategory = await countTopicsForSubject(topic.subject_id);
  const preview = await previewAwardXp({
    sourceType: "topic_completion",
    sourceId: topic.id,
    subjectId: topic.subject_id,
    category: "finalizacion_tema",
    score100: COMPLETION_SCORE,
    reason: topic.title,
    itemsSharingCategory,
  });
  return {
    kind: "topic",
    id: topic.id,
    label: topic.title,
    amount: preview.diff,
    alreadyAwarded: preview.diff <= 0 && preview.alreadyAwardedForKey > 0,
  };
}

export interface SubjectCompletionGate {
  eligible: boolean;
  pendingTopicCount: number;
}

/**
 * MVP: una materia solo puede cerrarse si todos sus temas no archivados
 * están completos. La secuenciación entre materias (por etapa) se resuelve
 * más adelante, cuando exista la jerarquía de Carrera — acá no se improvisa.
 */
export async function checkSubjectCompletionGate(subjectId: string): Promise<SubjectCompletionGate> {
  const topics = await topicsRepo.list({
    where: "subject_id = ? AND archived_at IS NULL",
    params: [subjectId],
  });
  const pending = topics.filter((t) => !t.completed_at);
  return { eligible: pending.length === 0, pendingTopicCount: pending.length };
}

export async function previewSubjectCompletion(subject: SubjectRow): Promise<CompletionPreviewItem> {
  const preview = await previewAwardXp({
    sourceType: "subject_completion",
    sourceId: subject.id,
    subjectId: subject.id,
    category: "cierre_materia",
    score100: COMPLETION_SCORE,
    reason: subject.title,
  });
  return {
    kind: "subject",
    id: subject.id,
    label: subject.title,
    amount: preview.diff,
    alreadyAwarded: preview.diff <= 0 && preview.alreadyAwardedForKey > 0,
  };
}

export async function completeTaskOrMilestone(
  kind: "task" | "milestone",
  id: string,
  subjectId: string | null,
  label: string,
): Promise<AwardXpResult> {
  if (kind === "task") {
    await tasksRepo.update(id, { completed_at: now(), status: "completada" });
  } else {
    await projectMilestonesRepo.update(id, { completed_at: now(), status: "completado" });
  }
  const itemsSharingCategory = subjectId ? await countTasksAndMilestonesForSubject(subjectId) : 1;
  return awardXp({
    sourceType: kind === "task" ? "task_completion" : "milestone_completion",
    sourceId: id,
    subjectId,
    category: "finalizacion_tarea_hito",
    score100: COMPLETION_SCORE,
    reason: label,
    itemsSharingCategory,
  });
}

export async function completeTopic(topicId: string): Promise<AwardXpResult> {
  const topic = await topicsRepo.getById(topicId);
  if (!topic) throw new Error("El tema indicado no existe.");

  await topicsRepo.update(topicId, { completed_at: now(), status: "completado" });
  const itemsSharingCategory = await countTopicsForSubject(topic.subject_id);
  return awardXp({
    sourceType: "topic_completion",
    sourceId: topicId,
    subjectId: topic.subject_id,
    category: "finalizacion_tema",
    score100: COMPLETION_SCORE,
    reason: topic.title,
    itemsSharingCategory,
  });
}

export interface CompleteSubjectResult {
  gate: SubjectCompletionGate;
  result: AwardXpResult | null;
}

/** Rechaza el cierre si quedan temas pendientes — nunca fuerza el gate en silencio. */
export async function completeSubject(subjectId: string): Promise<CompleteSubjectResult> {
  const gate = await checkSubjectCompletionGate(subjectId);
  if (!gate.eligible) {
    return { gate, result: null };
  }

  const subject = await subjectsRepo.getById(subjectId);
  if (!subject) throw new Error("La materia indicada no existe.");

  await subjectsRepo.update(subjectId, { completed_at: now(), status: "completada" });
  const result = await awardXp({
    sourceType: "subject_completion",
    sourceId: subjectId,
    subjectId,
    category: "cierre_materia",
    score100: COMPLETION_SCORE,
    reason: subject.title,
  });
  return { gate, result };
}
