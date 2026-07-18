import {
  academicAssignmentsRepo,
  assignmentSubmissionsRepo,
  topicsRepo,
} from "@/database/entities";
import type { AcademicAssignmentRow, AssignmentSubmissionRow, EvaluationVerdict } from "@/database/types";
import { getOrCreateValidationRubric, VALIDATION_WORK_TYPE } from "@/services/rubrics";
import {
  generateEvaluationPackage,
  importEvaluationResponse,
  type ImportEvaluationResult,
} from "@/services/evaluations";
import type { EvaluationResponse } from "@/schemas/evaluationResponse";

const now = () => new Date().toISOString();

/** Entre 3 y 10 preguntas — sección 11 del pedido; 5 por defecto. */
export const MIN_VALIDATION_QUESTIONS = 3;
export const MAX_VALIDATION_QUESTIONS = 10;
export const DEFAULT_VALIDATION_QUESTIONS = 5;

export type ValidationQuestionType =
  | "explicacion_propia"
  | "definicion"
  | "relacion"
  | "comparacion"
  | "aplicacion"
  | "ejercicio"
  | "caso"
  | "error"
  | "objecion"
  | "transferencia";

const QUESTION_TEMPLATES: Record<ValidationQuestionType, (topic: string) => string> = {
  explicacion_propia: (t) => `Explicá con tus propias palabras qué es "${t}", sin repetir la definición de memoria.`,
  definicion: (t) => `Definí "${t}" de forma precisa. ¿Qué lo distingue de conceptos parecidos?`,
  relacion: (t) => `¿Cómo se relaciona "${t}" con otros temas que ya estudiaste en esta materia?`,
  comparacion: (t) => `Compará "${t}" con una alternativa o enfoque distinto. ¿En qué se parecen y en qué difieren?`,
  aplicacion: (t) => `Dado un caso concreto, ¿cómo aplicarías "${t}" para resolverlo?`,
  ejercicio: (t) => `Resolvé un ejercicio breve que use "${t}" y explicá cada paso.`,
  caso: (t) => `Describí un caso real (propio o conocido) donde "${t}" fue relevante.`,
  error: (t) => `¿Cuál es un error común al entender "${t}"? ¿Por qué es un error?`,
  objecion: (t) => `¿Qué objeción le harías a "${t}"? ¿Cómo la responderías?`,
  transferencia: (t) => `¿Cómo usarías "${t}" en una situación totalmente distinta a la que estudiaste?`,
};

/** Los 3 tipos que siempre entran primero — el resto se suma en orden hasta llegar a `count`. */
const CORE_TYPES: ValidationQuestionType[] = ["explicacion_propia", "relacion", "aplicacion"];
const EXTRA_TYPES: ValidationQuestionType[] = [
  "definicion",
  "comparacion",
  "caso",
  "error",
  "objecion",
  "ejercicio",
  "transferencia",
];

export interface ValidationQuestion {
  type: ValidationQuestionType;
  text: string;
}

/**
 * Genera preguntas de validación de forma puramente local (Modo A: sin
 * Internet, sin IA) — plantillas parametrizadas por el título del tema, no
 * un banco de preguntas por tema (eso requeriría contenido que hoy no existe).
 */
export function generateValidationQuestions(
  topicTitle: string,
  count: number = DEFAULT_VALIDATION_QUESTIONS,
): ValidationQuestion[] {
  const clamped = Math.min(MAX_VALIDATION_QUESTIONS, Math.max(MIN_VALIDATION_QUESTIONS, count));
  const order = [...CORE_TYPES, ...EXTRA_TYPES].slice(0, clamped);
  return order.map((type) => ({ type, text: QUESTION_TEMPLATES[type](topicTitle) }));
}

export interface ValidationSession {
  assignment: AcademicAssignmentRow;
  rubricVersionId: string;
  questions: ValidationQuestion[];
}

/**
 * Reutiliza el mismo `academic_assignment` para todos los intentos de
 * validación de un tema (en vez de crear uno nuevo por intento) — así la
 * clave de idempotencia de XP (`awardXp`, basada en `sourceId`) sigue siendo
 * la misma entre reintentos: una segunda validación puede mejorar el
 * dominio, pero solo otorga la diferencia positiva de XP, nunca el monto
 * completo de nuevo (sección 14 del pedido).
 */
export async function startTopicValidation(
  topicId: string,
  questionCount: number = DEFAULT_VALIDATION_QUESTIONS,
): Promise<ValidationSession> {
  const topic = await topicsRepo.getById(topicId);
  if (!topic) throw new Error("El tema no existe.");

  const rubric = await getOrCreateValidationRubric();
  if (!rubric.currentVersion) throw new Error("La rúbrica de validación no tiene una versión vigente.");

  const existing = await academicAssignmentsRepo.list({
    where: "topic_id = ? AND work_type = ?",
    params: [topicId, VALIDATION_WORK_TYPE],
  });

  let assignment: AcademicAssignmentRow = existing[0] ?? {
    id: crypto.randomUUID(),
    title: `Validación de conocimiento — ${topic.title}`,
    work_type: VALIDATION_WORK_TYPE,
    subject_id: topic.subject_id,
    topic_id: topic.id,
    competency_id: null,
    fundamental_question_id: null,
    prompt: null,
    rubric_version_id: rubric.currentVersion.id,
    status: "borrador",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: now(),
    updated_at: now(),
    archived_at: null,
  };

  if (existing[0]) {
    // Si la rúbrica se revisionó desde el último intento, seguimos la vigente.
    if (assignment.rubric_version_id !== rubric.currentVersion.id) {
      await academicAssignmentsRepo.update(assignment.id, { rubric_version_id: rubric.currentVersion.id });
      assignment = { ...assignment, rubric_version_id: rubric.currentVersion.id };
    }
  } else {
    await academicAssignmentsRepo.insert(assignment);
  }

  const questions = generateValidationQuestions(topic.title, questionCount);
  const prompt = questions.map((q, i) => `${i + 1}. [${q.type}] ${q.text}`).join("\n");
  if (assignment.prompt !== prompt) {
    await academicAssignmentsRepo.update(assignment.id, { prompt });
    assignment = { ...assignment, prompt };
  }

  return { assignment, rubricVersionId: rubric.currentVersion.id, questions };
}

/** Modo B — arma el prompt único para pegar en ChatGPT (reutiliza generateEvaluationPackage tal cual). */
export async function buildValidationPromptForChatGpt(
  assignment: AcademicAssignmentRow,
  answersText: string,
): Promise<string> {
  const submission: AssignmentSubmissionRow = {
    id: "preview",
    assignment_id: assignment.id,
    version: 1,
    content: answersText,
    file_path: null,
    obsidian_note_id: null,
    work_hash: null,
    submitted_at: now(),
    status: "entregado",
    updated_at: now(),
  };
  return generateEvaluationPackage(assignment, submission);
}

async function insertSubmission(assignmentId: string, content: string): Promise<AssignmentSubmissionRow> {
  const previous = await assignmentSubmissionsRepo.list({
    where: "assignment_id = ? AND status = 'entregado'",
    params: [assignmentId],
  });
  for (const p of previous) {
    await assignmentSubmissionsRepo.update(p.id, { status: "reemplazado" });
  }
  const submission: AssignmentSubmissionRow = {
    id: crypto.randomUUID(),
    assignment_id: assignmentId,
    version: previous.length + 1,
    content,
    file_path: null,
    obsidian_note_id: null,
    work_hash: null,
    submitted_at: now(),
    status: "entregado",
    updated_at: now(),
  };
  await assignmentSubmissionsRepo.insert(submission);
  return submission;
}

/** Modo B — importa la respuesta JSON pegada desde ChatGPT (evaluator: "chatgpt"). */
export async function submitChatGptValidation(
  assignment: AcademicAssignmentRow,
  answersText: string,
  rawResponse: string,
): Promise<ImportEvaluationResult> {
  const submission = await insertSubmission(assignment.id, answersText);
  return importEvaluationResponse(assignment.id, submission.id, rawResponse, { evaluator: "chatgpt" });
}

export function verdictForScore(score100: number): EvaluationVerdict {
  if (score100 >= 90) return "outstanding";
  if (score100 >= 75) return "advanced";
  if (score100 >= 60) return "competent";
  if (score100 >= 40) return "basic";
  return "revision_required";
}

export interface LocalCriterionScore {
  criterionId: string;
  score: number;
  maximum: number;
  justification: string;
}

/**
 * Modo A — autoevaluación local, sin Internet y sin IA: el propio usuario
 * puntúa cada criterio de la rúbrica. Se construye la misma estructura
 * validada que usa el Modo B (EvaluationResponse) para reutilizar
 * exactamente el mismo camino de guardado — solo cambia el evaluador
 * ("fundador", no "chatgpt").
 */
export async function submitLocalValidation(
  assignment: AcademicAssignmentRow,
  rubricVersion: string,
  answersText: string,
  criteria: LocalCriterionScore[],
  evaluatorNotes: string,
): Promise<ImportEvaluationResult> {
  const totalScore = Math.round(criteria.reduce((sum, c) => sum + c.score, 0));
  const response: EvaluationResponse = {
    rubricVersion,
    assignmentId: assignment.id,
    totalScore,
    score10: Math.round((totalScore / 10) * 10) / 10,
    criteria: criteria.map((c) => ({
      criterionId: c.criterionId,
      score: c.score,
      maximum: c.maximum,
      justification: c.justification || "Autoevaluación (Modo A).",
      evidence: [],
      weaknesses: [],
      requiredImprovements: [],
    })),
    strengths: [],
    criticalErrors: [],
    requiredRevisions: [],
    verdict: verdictForScore(totalScore),
    confidence: 100,
    evaluatorNotes,
  };

  const submission = await insertSubmission(assignment.id, answersText);
  return importEvaluationResponse(assignment.id, submission.id, JSON.stringify(response), { evaluator: "fundador" });
}
