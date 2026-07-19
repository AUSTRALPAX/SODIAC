/**
 * Vocabulario ampliado de estados de aprendizaje de un tema (sección 10-11
 * del pedido "Flujo de trabajo, historial de conocimiento y validación").
 *
 * No es una máquina de estados que bloquee el completar un tema — es un
 * estado calculado, solo para mostrar el momento real en el que está el
 * tema. `topic.status`/`topic.completed_at` en la base siguen siendo la
 * fuente de verdad para el gate de completitud (completionXp.ts); esto es
 * una capa de lectura encima, pensada para enriquecerse en fases futuras
 * (nota consolidada real, validación de conocimiento, repaso) sin tener
 * que cambiar cómo se calcula el XP ni el gate de la materia.
 */
import {
  academicAssignmentsRepo,
  academicEvaluationsRepo,
  assignmentSubmissionsRepo,
  obsidianNotesRepo,
  reviewsRepo,
  studySessionsRepo,
} from "@/database/entities";
import { VALIDATION_WORK_TYPE } from "@/services/rubrics";

export type TopicLearningState =
  | "pendiente"
  | "en_estudio"
  | "nota_consolidada"
  | "validacion_pendiente"
  | "validacion_aprobada"
  | "dominado"
  | "enfriado"
  | "reabierto";

export const TOPIC_LEARNING_STATE_LABELS: Record<TopicLearningState, string> = {
  pendiente: "Pendiente",
  en_estudio: "En estudio",
  nota_consolidada: "Nota consolidada",
  validacion_pendiente: "Validación pendiente",
  validacion_aprobada: "Validación aprobada",
  dominado: "Dominado",
  enfriado: "Enfriado",
  reabierto: "Reabierto",
};

export interface TopicLearningStateInput {
  completedAt: string | null;
  /** Señal opcional — llega en una fase futura (vínculo real con Obsidian). */
  hasConsolidatedNote?: boolean;
  /** Señal opcional — llega con la validación de conocimiento (fase 4). */
  validationStatus?: "pendiente" | "aprobada" | null;
  /** Señal opcional — llega del sistema de repasos. */
  reviewState?: string | null;
  /** Señal opcional — hubo al menos una sesión de estudio sobre este tema. */
  hasStudySession?: boolean;
}

/**
 * Devuelve el único estado más relevante para mostrar — nunca una lista de
 * los 8 posibles. El orden de las comprobaciones es intencional: un tema
 * dominado que se enfrió se muestra "enfriado" (para invitar al repaso),
 * no "dominado" (que ya no reflejaría la urgencia real).
 */
export function computeTopicLearningState(input: TopicLearningStateInput): TopicLearningState {
  if (input.reviewState === "enfriado") return "enfriado";
  if (input.completedAt) return "dominado";
  if (input.validationStatus === "aprobada") return "validacion_aprobada";
  if (input.validationStatus === "pendiente") return "validacion_pendiente";
  if (input.hasConsolidatedNote) return "nota_consolidada";
  if (input.hasStudySession) return "en_estudio";
  return "pendiente";
}

export type TopicLearningSignals = Omit<TopicLearningStateInput, "completedAt">;

/**
 * Carga masiva (no N+1) de las señales reales por tema — sesiones de
 * estudio, notas de Obsidian vinculadas, validación de conocimiento
 * (fase 4) y el repaso más reciente (fase 7). Se llama una vez por
 * pantalla y se combina con `topic.completed_at` en el llamador, en vez de
 * mostrar el badge solo con `completedAt` como pasaba hasta ahora.
 */
export async function loadTopicLearningSignals(): Promise<Map<string, TopicLearningSignals>> {
  const [sessions, notes, assignments, submissions, evaluations, reviews] = await Promise.all([
    studySessionsRepo.list({ where: "topic_id IS NOT NULL" }),
    obsidianNotesRepo.list({ where: "sodiac_id IS NOT NULL" }),
    academicAssignmentsRepo.list({ where: "work_type = ? AND topic_id IS NOT NULL", params: [VALIDATION_WORK_TYPE] }),
    assignmentSubmissionsRepo.list({}),
    academicEvaluationsRepo.list({}),
    reviewsRepo.list({ where: "topic_id IS NOT NULL AND archived_at IS NULL", orderBy: "updated_at DESC" }),
  ]);

  const hasSessionTopics = new Set(sessions.map((s) => s.topic_id).filter((id): id is string => !!id));
  const noteTopics = new Set(notes.map((n) => n.sodiac_id).filter((id): id is string => !!id));

  const evaluationsBySubmission = new Map<string, typeof evaluations>();
  for (const evaluation of evaluations) {
    const list = evaluationsBySubmission.get(evaluation.submission_id) ?? [];
    list.push(evaluation);
    evaluationsBySubmission.set(evaluation.submission_id, list);
  }
  const submissionsByAssignment = new Map<string, typeof submissions>();
  for (const submission of submissions) {
    const list = submissionsByAssignment.get(submission.assignment_id) ?? [];
    list.push(submission);
    submissionsByAssignment.set(submission.assignment_id, list);
  }

  const validationStatusByTopic = new Map<string, "pendiente" | "aprobada">();
  for (const assignment of assignments) {
    if (!assignment.topic_id) continue;
    const subs = submissionsByAssignment.get(assignment.id) ?? [];
    const evals = subs.flatMap((s) => evaluationsBySubmission.get(s.id) ?? []);
    if (evals.some((e) => e.status === "aceptada")) {
      validationStatusByTopic.set(assignment.topic_id, "aprobada");
    } else if (!validationStatusByTopic.has(assignment.topic_id)) {
      validationStatusByTopic.set(assignment.topic_id, "pendiente");
    }
  }

  const reviewStateByTopic = new Map<string, string>();
  for (const review of reviews) {
    if (!review.topic_id || reviewStateByTopic.has(review.topic_id)) continue;
    reviewStateByTopic.set(review.topic_id, review.state); // ordenados updated_at DESC: el primero es el más reciente
  }

  const allTopicIds = new Set([
    ...hasSessionTopics,
    ...noteTopics,
    ...validationStatusByTopic.keys(),
    ...reviewStateByTopic.keys(),
  ]);

  const result = new Map<string, TopicLearningSignals>();
  for (const topicId of allTopicIds) {
    result.set(topicId, {
      hasStudySession: hasSessionTopics.has(topicId),
      hasConsolidatedNote: noteTopics.has(topicId),
      validationStatus: validationStatusByTopic.get(topicId) ?? null,
      reviewState: reviewStateByTopic.get(topicId) ?? null,
    });
  }
  return result;
}

export const TOPIC_LEARNING_STATE_TONE: Record<TopicLearningState, "muted" | "accent" | "success" | "warning"> = {
  pendiente: "muted",
  en_estudio: "accent",
  nota_consolidada: "accent",
  validacion_pendiente: "warning",
  validacion_aprobada: "success",
  dominado: "success",
  enfriado: "warning",
  reabierto: "accent",
};
