/**
 * Historial de conocimiento (Fase 6): línea temporal de todo lo que ya
 * existe en SODIAC sobre un tema o una materia — no crea ninguna tabla
 * nueva, solo agrega y ordena eventos que ya se registran hoy: sesiones de
 * estudio, notas de Obsidian indexadas/actualizadas, intentos de validación
 * de conocimiento (evolución de respuestas, Fase 4) y XP otorgado.
 */
import {
  academicAssignmentsRepo,
  academicEvaluationsRepo,
  assignmentSubmissionsRepo,
  obsidianNotesRepo,
  resourceUsageEventsRepo,
  studySessionsRepo,
  xpEventsRepo,
} from "@/database/entities";
import { VALIDATION_WORK_TYPE } from "@/services/rubrics";

export type KnowledgeHistoryEventKind =
  | "sesion_estudio"
  | "nota_obsidian"
  | "validacion_intento"
  | "xp_otorgado"
  | "recurso_usado";

export interface KnowledgeHistoryEntry {
  id: string;
  occurredAt: string;
  kind: KnowledgeHistoryEventKind;
  title: string;
  detail: string | null;
  topicId: string | null;
  subjectId: string | null;
}

export const KNOWLEDGE_HISTORY_KIND_LABEL: Record<KnowledgeHistoryEventKind, string> = {
  sesion_estudio: "Sesión de estudio",
  nota_obsidian: "Nota de Obsidian",
  validacion_intento: "Validación de conocimiento",
  xp_otorgado: "XP otorgado",
  recurso_usado: "Recurso bibliográfico",
};

/** Orden descendente por fecha; a igualdad de fecha, mantiene el orden de inserción (estable). */
export function sortHistoryEntries(entries: KnowledgeHistoryEntry[]): KnowledgeHistoryEntry[] {
  return [...entries].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
}

async function validationEntries(where: string, params: unknown[]): Promise<KnowledgeHistoryEntry[]> {
  const assignments = await academicAssignmentsRepo.list({
    where: `work_type = ? AND ${where}`,
    params: [VALIDATION_WORK_TYPE, ...params],
  });
  if (assignments.length === 0) return [];

  const entries: KnowledgeHistoryEntry[] = [];
  for (const assignment of assignments) {
    const submissions = await assignmentSubmissionsRepo.list({
      where: "assignment_id = ?",
      params: [assignment.id],
      orderBy: "version ASC",
    });
    for (const submission of submissions) {
      const evaluations = await academicEvaluationsRepo.list({
        where: "submission_id = ?",
        params: [submission.id],
      });
      const accepted = evaluations.find((e) => e.status === "aceptada") ?? evaluations[0] ?? null;
      entries.push({
        id: submission.id,
        occurredAt: submission.submitted_at,
        kind: "validacion_intento",
        title: `Intento de validación #${submission.version}`,
        detail: accepted
          ? `Veredicto: ${accepted.verdict} (${accepted.total_score}/100, evaluador: ${accepted.evaluator})`
          : "Sin evaluación registrada todavía.",
        topicId: assignment.topic_id,
        subjectId: assignment.subject_id,
      });
    }
  }
  return entries;
}

async function studySessionEntries(where: string, params: unknown[]): Promise<KnowledgeHistoryEntry[]> {
  const sessions = await studySessionsRepo.list({ where, params });
  return sessions
    .filter((s) => s.started_at)
    .map((s) => ({
      id: s.id,
      occurredAt: s.started_at!,
      kind: "sesion_estudio" as const,
      title: s.observable_objective ?? `Sesión (${s.session_type})`,
      detail: s.conclusion,
      topicId: s.topic_id,
      subjectId: s.subject_id,
    }));
}

async function noteEntries(sodiacId: string): Promise<KnowledgeHistoryEntry[]> {
  const notes = await obsidianNotesRepo.list({ where: "sodiac_id = ?", params: [sodiacId] });
  return notes.map((n) => ({
    id: n.id,
    occurredAt: n.updated_at,
    kind: "nota_obsidian" as const,
    title: n.title ?? n.vault_relative_path,
    detail: n.mastery_level != null ? `Nivel de dominio declarado en la nota: ${n.mastery_level}` : null,
    topicId: null,
    subjectId: null,
  }));
}

async function xpEntries(where: string, params: unknown[]): Promise<KnowledgeHistoryEntry[]> {
  const events = await xpEventsRepo.list({ where, params });
  return events.map((e) => ({
    id: e.id,
    occurredAt: e.date,
    kind: "xp_otorgado" as const,
    title: `+${Math.round(e.amount)} XP — ${e.category}`,
    detail: e.reason,
    topicId: null,
    subjectId: e.subject_id,
  }));
}

async function resourceUsageEntries(where: string, params: unknown[]): Promise<KnowledgeHistoryEntry[]> {
  const events = await resourceUsageEventsRepo.list({ where, params });
  return events.map((e) => ({
    id: e.id,
    occurredAt: e.occurred_at,
    kind: "recurso_usado" as const,
    title: `Recurso ${e.action}`,
    detail: null,
    topicId: e.topic_id,
    subjectId: e.subject_id,
  }));
}

export async function getTopicKnowledgeHistory(topicId: string): Promise<KnowledgeHistoryEntry[]> {
  const [sessions, validations, notes, resourceUsage] = await Promise.all([
    studySessionEntries("topic_id = ?", [topicId]),
    validationEntries("topic_id = ?", [topicId]),
    noteEntries(topicId),
    resourceUsageEntries("topic_id = ?", [topicId]),
  ]);
  return sortHistoryEntries([...sessions, ...validations, ...notes, ...resourceUsage]);
}

export async function getSubjectKnowledgeHistory(subjectId: string): Promise<KnowledgeHistoryEntry[]> {
  const [sessions, validations, notes, xp, resourceUsage] = await Promise.all([
    studySessionEntries("subject_id = ?", [subjectId]),
    validationEntries("subject_id = ?", [subjectId]),
    noteEntries(subjectId),
    xpEntries("subject_id = ?", [subjectId]),
    resourceUsageEntries("subject_id = ?", [subjectId]),
  ]);
  return sortHistoryEntries([...sessions, ...validations, ...notes, ...xp, ...resourceUsage]);
}
