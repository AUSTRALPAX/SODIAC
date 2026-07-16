import {
  competenciesRepo,
  continuityPointsRepo,
  fundamentalQuestionsRepo,
  learningEvidenceRepo,
  masteryAssessmentsRepo,
  reviewsRepo,
  studySessionsRepo,
  subjectsRepo,
  tasksRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  ContinuityPointRow,
  LearningEvidenceRow,
  MasteryAssessmentRow,
  ReviewRow,
  SessionType,
  StudySessionRow,
} from "@/database/types";
import { createTask } from "@/services/tasks";

const now = () => new Date().toISOString();

export interface StartSessionInput {
  fundamental_question_id?: string | null;
  competency_id?: string | null;
  subject_id?: string | null;
  topic_id?: string | null;
  session_type: SessionType;
  planned_duration_min?: number | null;
  prior_knowledge?: string | null;
  observable_objective: string;
  resources?: string | null;
  expected_product?: string | null;
}

/** Protocolo INICIAR ESTUDIO (Hoja de Ruta §13, Compendio Maestro ampliación). */
export async function startSession(input: StartSessionInput): Promise<StudySessionRow> {
  const row: StudySessionRow = {
    id: crypto.randomUUID(),
    fundamental_question_id: input.fundamental_question_id ?? null,
    competency_id: input.competency_id ?? null,
    subject_id: input.subject_id ?? null,
    topic_id: input.topic_id ?? null,
    session_type: input.session_type,
    planned_duration_min: input.planned_duration_min ?? null,
    actual_duration_min: null,
    prior_knowledge: input.prior_knowledge ?? null,
    observable_objective: input.observable_objective,
    resources: input.resources ?? null,
    expected_product: input.expected_product ?? null,
    continuity_point_prev_id: null,
    started_at: now(),
    ended_at: null,
    closure_status: "en_curso",
    conclusion: null,
    evidence_summary: null,
    next_action: null,
    continuity_point: null,
    status: "activa",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: now(),
    updated_at: now(),
    archived_at: null,
  };
  return studySessionsRepo.insert(row);
}

/** Para recuperar una sesión interrumpida por cierre inesperado (prompt maestro §9). */
export async function getInProgressSession(): Promise<StudySessionRow | null> {
  const rows = await studySessionsRepo.list({
    where: "closure_status = 'en_curso' AND status = 'activa'",
    orderBy: "started_at DESC",
  });
  return rows[0] ?? null;
}

export async function listSessions(): Promise<StudySessionRow[]> {
  return studySessionsRepo.list({ orderBy: "started_at DESC" });
}

export async function cancelSession(id: string, reason?: string): Promise<void> {
  await studySessionsRepo.update(id, {
    closure_status: "cancelada",
    ended_at: now(),
    conclusion: reason ?? "Sesión cancelada por el usuario.",
  });
}

export async function markSessionIncomplete(id: string, reason: string): Promise<void> {
  await studySessionsRepo.update(id, {
    closure_status: "incompleta",
    ended_at: now(),
    conclusion: reason,
  });
}

/**
 * Programar una sesión para más adelante sin comenzarla todavía. Usa la
 * columna `status` (texto libre, sin CHECK) en vez de `closure_status`
 * (con CHECK fijo a en_curso/formal/cancelada/incompleta) para no requerir
 * una migración — ver docs/UPDATE_1_1_BASELINE.md.
 */
export async function scheduleSession(
  input: StartSessionInput,
  scheduledAt: string,
): Promise<StudySessionRow> {
  const row: StudySessionRow = {
    id: crypto.randomUUID(),
    fundamental_question_id: input.fundamental_question_id ?? null,
    competency_id: input.competency_id ?? null,
    subject_id: input.subject_id ?? null,
    topic_id: input.topic_id ?? null,
    session_type: input.session_type,
    planned_duration_min: input.planned_duration_min ?? null,
    actual_duration_min: null,
    prior_knowledge: input.prior_knowledge ?? null,
    observable_objective: input.observable_objective,
    resources: input.resources ?? null,
    expected_product: input.expected_product ?? null,
    continuity_point_prev_id: null,
    started_at: scheduledAt,
    ended_at: null,
    closure_status: "en_curso",
    conclusion: null,
    evidence_summary: null,
    next_action: null,
    continuity_point: null,
    status: "programada",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: now(),
    updated_at: now(),
    archived_at: null,
  };
  return studySessionsRepo.insert(row);
}

export async function listScheduledSessions(): Promise<StudySessionRow[]> {
  return studySessionsRepo.list({
    where: "status = 'programada' AND archived_at IS NULL",
    orderBy: "started_at ASC",
  });
}

/** Próxima sesión relevante: la que está en curso o, si no hay, la programada más próxima. */
export async function getNextSession(): Promise<StudySessionRow | null> {
  const inProgress = await getInProgressSession();
  if (inProgress) return inProgress;
  const scheduled = await listScheduledSessions();
  return scheduled[0] ?? null;
}

export async function startScheduledSession(id: string): Promise<StudySessionRow> {
  await studySessionsRepo.update(id, { status: "activa", started_at: now() });
  const updated = await studySessionsRepo.getById(id);
  if (!updated) throw new Error("La sesión no existe.");
  return updated;
}

export async function reprogramSession(id: string, newScheduledAt: string): Promise<void> {
  await studySessionsRepo.update(id, { started_at: newScheduledAt });
}

export async function getRelatedTaskForSession(sessionId: string) {
  const rows = await tasksRepo.list({ where: "study_session_id = ?", params: [sessionId] });
  return rows[0] ?? null;
}

export interface ComprobacionInput {
  method: string;
  response: string;
}

/** Protocolo COMPROBAR (Hoja de Ruta §10): produce una LearningEvidence vinculada. */
export async function recordComprobacion(
  sessionId: string,
  input: ComprobacionInput,
): Promise<LearningEvidenceRow> {
  const evidence: LearningEvidenceRow = {
    id: crypto.randomUUID(),
    study_session_id: sessionId,
    project_id: null,
    evidence_type: input.method,
    title: `Comprobación — ${input.method}`,
    description: input.response,
    file_path: null,
    obsidian_note_id: null,
    status: "activa",
    sort_order: 0,
    notes: null,
    tags: "comprobacion",
    created_at: now(),
    updated_at: now(),
    archived_at: null,
  };
  return learningEvidenceRepo.insert(evidence);
}

export interface FinalizeSessionInput {
  // Cierre mínimo obligatorio (prompt maestro §11) — nunca opcional.
  conclusion: string;
  evidenceSummary: string;
  nextAction: string;
  continuityPoint: string;
  // Campos extendidos, opcionales.
  masteryLevel?: number;
  masteryConfidence?: number;
  masteryDifficulty?: number;
  masteryExplanation?: string;
  needsReview?: boolean;
  reviewDueAt?: string | null;
}

export interface FinalizeSessionResult {
  session: StudySessionRow;
  continuityPoint: ContinuityPointRow;
  mastery: MasteryAssessmentRow | null;
  review: ReviewRow | null;
}

/**
 * Protocolo FINALIZAR ESTUDIO (Hoja de Ruta §14). No permite cerrar una
 * sesión formal sin los cuatro campos mínimos (conclusión, evidencia,
 * próxima acción, punto de continuidad) — ver docs/PRODUCT_SPEC.md.
 */
export async function finalizeSession(
  sessionId: string,
  input: FinalizeSessionInput,
): Promise<FinalizeSessionResult> {
  if (!input.conclusion.trim() || !input.evidenceSummary.trim() || !input.nextAction.trim() || !input.continuityPoint.trim()) {
    throw new Error(
      "El cierre mínimo requiere conclusión, evidencia, próxima acción y punto de continuidad.",
    );
  }

  const session = await studySessionsRepo.getById(sessionId);
  if (!session) throw new Error("La sesión no existe.");

  const endedAt = now();
  const actualMinutes = session.started_at
    ? Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(session.started_at).getTime()) / 60_000))
    : null;

  await studySessionsRepo.update(sessionId, {
    closure_status: "formal",
    ended_at: endedAt,
    actual_duration_min: actualMinutes,
    conclusion: input.conclusion,
    evidence_summary: input.evidenceSummary,
    next_action: input.nextAction,
    continuity_point: input.continuityPoint,
  });

  const continuityPointRow: ContinuityPointRow = {
    id: crypto.randomUUID(),
    study_session_id: sessionId,
    topic_id: session.topic_id,
    project_id: null,
    description: input.continuityPoint,
    created_at: now(),
  };
  await continuityPointsRepo.insert(continuityPointRow);

  await createTask({
    title: input.nextAction,
    task_type: "estudio",
    study_session_id: sessionId,
  });

  let mastery: MasteryAssessmentRow | null = null;
  if (session.competency_id && input.masteryLevel !== undefined) {
    mastery = {
      id: crypto.randomUUID(),
      competency_id: session.competency_id,
      topic_id: session.topic_id,
      level: input.masteryLevel,
      assessed_at: now(),
      declared_confidence: input.masteryConfidence ?? null,
      perceived_difficulty: input.masteryDifficulty ?? null,
      result_explanation: input.masteryExplanation ?? null,
      evidence_id: null,
      evaluator: "fundador",
      is_provisional: 1,
      next_advance_criterion: null,
      status: "activa",
      notes: null,
      created_at: now(),
      updated_at: now(),
    };
    await masteryAssessmentsRepo.insert(mastery);
  }

  let review: ReviewRow | null = null;
  if (input.needsReview) {
    review = {
      id: crypto.randomUUID(),
      competency_id: session.competency_id,
      topic_id: session.topic_id,
      evidence_id: null,
      due_at: input.reviewDueAt ?? null,
      state: input.reviewDueAt ? "proximo" : "no_programado",
      reason_factors: JSON.stringify({ origen: "finalizar_estudio", session_id: sessionId }),
      completed_at: null,
      status: "activo",
      sort_order: 0,
      notes: null,
      tags: null,
      created_at: now(),
      updated_at: now(),
      archived_at: null,
    };
    await reviewsRepo.insert(review);
  }

  const updated = await studySessionsRepo.getById(sessionId);
  return { session: updated!, continuityPoint: continuityPointRow, mastery, review };
}

/** Prompt estructurado listo para copiar en ChatGPT (Hoja de Ruta §13, ejemplo de comando). */
export async function generateChatGptPrompt(input: StartSessionInput): Promise<string> {
  const [question, competency, subject, topic] = await Promise.all([
    input.fundamental_question_id ? fundamentalQuestionsRepo.getById(input.fundamental_question_id) : null,
    input.competency_id ? competenciesRepo.getById(input.competency_id) : null,
    input.subject_id ? subjectsRepo.getById(input.subject_id) : null,
    input.topic_id ? topicsRepo.getById(input.topic_id) : null,
  ]);

  const lines = ["INICIAR ESTUDIO", ""];
  if (question) lines.push(`Pregunta fundamental: ${question.title}`);
  if (competency) lines.push(`Competencia: ${competency.title}`);
  if (subject) lines.push(`Materia: ${subject.title}`);
  if (topic) lines.push(`Tema: ${topic.title}`);
  lines.push(`Tipo de sesión: ${input.session_type}`);
  if (input.planned_duration_min) lines.push(`Duración disponible: ${input.planned_duration_min} minutos`);
  if (input.prior_knowledge) lines.push("", `Conocimiento previo: ${input.prior_knowledge}`);
  lines.push("", `Objetivo observable: ${input.observable_objective}`);
  if (input.resources) lines.push("", `Recursos: ${input.resources}`);
  if (input.expected_product) lines.push("", `Producto esperado: ${input.expected_product}`);

  return lines.join("\n");
}
