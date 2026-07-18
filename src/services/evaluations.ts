import {
  academicAssignmentsRepo,
  academicEvaluationsRepo,
  academicTranscriptEntriesRepo,
  assignmentSubmissionsRepo,
  competenciesRepo,
  criterionEvaluationsRepo,
  evaluationImportsRepo,
  fundamentalQuestionsRepo,
  gradingRubricVersionsRepo,
  rubricCriteriaRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  AcademicAssignmentRow,
  AcademicEvaluationRow,
  AssignmentSubmissionRow,
  EvaluationImportRow,
  RubricCriterionRow,
  XpCategory,
} from "@/database/types";
import { validateEvaluationResponse, type EvaluationResponse } from "@/schemas/evaluationResponse";
import { awardXp } from "@/services/xp";

const now = () => new Date().toISOString();

/** "Evaluación asistida por criterios" — nunca "objetiva garantizada" (prompt maestro §7). */
export const EVALUATION_DISCLAIMER = "Evaluación asistida por criterios";

/** Genera el paquete de evaluación (Modalidad A — intercambio manual, prompt maestro §8). */
export async function generateEvaluationPackage(
  assignment: AcademicAssignmentRow,
  submission: AssignmentSubmissionRow,
): Promise<string> {
  const [subject, topic, competency, question, rubricVersion] = await Promise.all([
    assignment.subject_id ? subjectsRepo.getById(assignment.subject_id) : null,
    assignment.topic_id ? topicsRepo.getById(assignment.topic_id) : null,
    assignment.competency_id ? competenciesRepo.getById(assignment.competency_id) : null,
    assignment.fundamental_question_id ? fundamentalQuestionsRepo.getById(assignment.fundamental_question_id) : null,
    assignment.rubric_version_id ? gradingRubricVersionsRepo.getById(assignment.rubric_version_id) : null,
  ]);
  const criteria = rubricVersion
    ? await rubricCriteriaRepo.list({ where: "rubric_version_id = ?", params: [rubricVersion.id], orderBy: "sort_order" })
    : [];

  const lines: string[] = [];
  lines.push(`${EVALUATION_DISCLAIMER} — SODIAC`, "");
  lines.push(`Materia: ${subject?.title ?? "—"}`);
  if (topic) lines.push(`Tema: ${topic.title}`);
  if (competency) lines.push(`Competencia: ${competency.title}`);
  if (question) lines.push(`Pregunta fundamental: ${question.title}`);
  lines.push(`Trabajo: ${assignment.title} (${assignment.work_type})`, "");

  if (assignment.prompt) lines.push("Consigna original:", assignment.prompt, "");

  lines.push(`Rúbrica (versión ${rubricVersion?.version_label ?? "—"}, ${rubricVersion?.total_points ?? 100} puntos):`);
  for (const c of criteria) {
    lines.push(`- [${c.code}] ${c.title} (${c.weight_points} pts)${c.description ? ` — ${c.description}` : ""}`);
  }
  lines.push("");

  lines.push("Trabajo entregado:", submission.content ?? `(archivo: ${submission.file_path ?? "sin contenido"})`, "");

  lines.push(
    "Instrucciones para el evaluador:",
    "- Evaluá cada criterio por separado, sin promediar intuitivamente: calculá la nota desde los criterios.",
    "- No premies la extensión ni un tono convincente sin evidencia.",
    "- Identificá errores conceptuales y distingue un error grave de una mejora menor.",
    "- Justificá cada puntuación con evidencia textual concreta del trabajo.",
    "- Reconocé la incertidumbre cuando corresponda (campo confidence).",
    "- No inventes fuentes ni alteres los criterios o pesos de la rúbrica.",
    "",
    "Respondé ÚNICAMENTE con un JSON que cumpla exactamente este esquema (sin texto adicional):",
    "",
    JSON.stringify(
      {
        rubricVersion: rubricVersion?.version_label ?? "string",
        assignmentId: assignment.id,
        totalScore: 0,
        score10: 0,
        criteria: criteria.map((c) => ({
          criterionId: c.code,
          score: 0,
          maximum: c.weight_points,
          justification: "string",
          evidence: ["string"],
          weaknesses: ["string"],
          requiredImprovements: ["string"],
        })),
        strengths: ["string"],
        criticalErrors: ["string"],
        requiredRevisions: ["string"],
        verdict: "revision_required | basic | competent | advanced | outstanding",
        confidence: 0,
        evaluatorNotes: "string",
      },
      null,
      2,
    ),
  );

  return lines.join("\n");
}

/** Mapea el tipo de trabajo a la categoría de XP correspondiente (prompt maestro §13). */
export function categoryForWorkType(workType: string): XpCategory {
  const map: Record<string, XpCategory> = {
    nota_conceptual: "notas_conceptuales",
    ejercicio: "ejercicios_practicas",
    problema: "ejercicios_practicas",
    resumen_critico: "notas_conceptuales",
    analisis_empresarial: "aplicaciones_casos",
    analisis_economico: "aplicaciones_casos",
    estudio_de_caso: "aplicaciones_casos",
    simulacion: "aplicaciones_casos",
    modelo: "aplicaciones_casos",
    planilla: "aplicaciones_casos",
    ensayo: "aplicaciones_casos",
    examen: "proyecto_examen_integrador",
    proyecto: "proyecto_examen_integrador",
    producto_integrador: "proyecto_examen_integrador",
    defensa: "revision_diferida_retencion",
    presentacion: "aplicaciones_casos",
    capitulo: "proyecto_examen_integrador",
    protocolo: "ejercicios_practicas",
    trabajo_libre: "ejercicios_practicas",
    validacion_conocimiento: "validacion_conocimiento",
  };
  return map[workType] ?? "ejercicios_practicas";
}

async function insertEvaluationFromResponse(
  submissionId: string,
  data: EvaluationResponse,
  rubricVersionId: string,
  isCalibration: boolean,
  calibrationOfId: string | null,
  promptUsed: string | null,
  workHash: string | null,
  evaluator: AcademicEvaluationRow["evaluator"] = "chatgpt",
): Promise<AcademicEvaluationRow> {
  const evaluation: AcademicEvaluationRow = {
    id: crypto.randomUUID(),
    submission_id: submissionId,
    rubric_version_id: rubricVersionId,
    total_score: Math.round(data.totalScore),
    score_10: data.score10,
    verdict: data.verdict,
    confidence: data.confidence,
    evaluator_notes: data.evaluatorNotes || null,
    evaluator,
    prompt_used: promptUsed,
    work_hash: workHash,
    strengths_json: JSON.stringify(data.strengths),
    critical_errors_json: JSON.stringify(data.criticalErrors),
    required_revisions_json: JSON.stringify(data.requiredRevisions),
    is_calibration: isCalibration ? 1 : 0,
    calibration_of_id: calibrationOfId,
    status: "pendiente",
    accepted_at: null,
    created_at: now(),
    updated_at: now(),
  };
  await academicEvaluationsRepo.insert(evaluation);

  for (const c of data.criteria) {
    const criterionRow: RubricCriterionRow[] = await rubricCriteriaRepo.list({
      where: "rubric_version_id = ? AND code = ?",
      params: [rubricVersionId, c.criterionId],
    });
    const criterionId = criterionRow[0]?.id ?? c.criterionId;
    await criterionEvaluationsRepo.insert({
      id: crypto.randomUUID(),
      evaluation_id: evaluation.id,
      criterion_id: criterionId,
      score: c.score,
      maximum: c.maximum,
      justification: c.justification,
      evidence_json: JSON.stringify(c.evidence),
      weaknesses_json: JSON.stringify(c.weaknesses),
      required_improvements_json: JSON.stringify(c.requiredImprovements),
    });
  }

  return evaluation;
}

export interface ImportEvaluationResult {
  importRecord: EvaluationImportRow;
  evaluation: AcademicEvaluationRow | null;
  errors: string[];
  requiresCalibrationReview: boolean;
  calibrationDifference: number | null;
}

/**
 * Importa una respuesta pegada desde ChatGPT (Modalidad A). Rechaza JSON
 * inválido o incoherente con la rúbrica (prompt maestro §8) antes de crear
 * nada. Si `calibrationOfId` se pasa, es la segunda pasada de una doble
 * evaluación: si difiere más de 7 puntos de la primera, ninguna nota queda
 * aceptada automáticamente (prompt maestro §9).
 */
export async function importEvaluationResponse(
  assignmentId: string,
  submissionId: string,
  rawText: string,
  options?: { calibrationOfId?: string; promptUsed?: string; evaluator?: AcademicEvaluationRow["evaluator"] },
): Promise<ImportEvaluationResult> {
  const assignment = await academicAssignmentsRepo.getById(assignmentId);
  if (!assignment?.rubric_version_id) throw new Error("El trabajo no tiene una rúbrica asignada.");

  let parsedJson: unknown;
  let parseError: string | null = null;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  const validation = parseError
    ? { valid: false, data: null, errors: [`JSON inválido: ${parseError}`] }
    : validateEvaluationResponse(parsedJson);

  const importRecord: EvaluationImportRow = {
    id: crypto.randomUUID(),
    assignment_id: assignmentId,
    submission_id: submissionId,
    raw_response_json: rawText,
    validation_status: validation.valid ? "valida" : "rechazada",
    validation_errors_json: validation.errors.length > 0 ? JSON.stringify(validation.errors) : null,
    resulting_evaluation_id: null,
    imported_at: now(),
  };

  if (!validation.valid || !validation.data) {
    await evaluationImportsRepo.insert(importRecord);
    return { importRecord, evaluation: null, errors: validation.errors, requiresCalibrationReview: false, calibrationDifference: null };
  }

  const submission = await assignmentSubmissionsRepo.getById(submissionId);
  const evaluation = await insertEvaluationFromResponse(
    submissionId,
    validation.data,
    assignment.rubric_version_id,
    !!options?.calibrationOfId,
    options?.calibrationOfId ?? null,
    options?.promptUsed ?? null,
    submission?.work_hash ?? null,
    options?.evaluator ?? "chatgpt",
  );

  importRecord.resulting_evaluation_id = evaluation.id;
  await evaluationImportsRepo.insert(importRecord);
  await academicAssignmentsRepo.update(assignmentId, { status: "evaluado" });

  let requiresCalibrationReview = false;
  let calibrationDifference: number | null = null;
  if (options?.calibrationOfId) {
    const first = await academicEvaluationsRepo.getById(options.calibrationOfId);
    if (first) {
      calibrationDifference = Math.abs(first.total_score - evaluation.total_score);
      if (calibrationDifference > 7) {
        requiresCalibrationReview = true;
        await academicEvaluationsRepo.update(first.id, { status: "revision_requerida" });
        await academicEvaluationsRepo.update(evaluation.id, { status: "revision_requerida" });
      }
    }
  }

  return { importRecord, evaluation, errors: [], requiresCalibrationReview, calibrationDifference };
}

/**
 * Acepta una evaluación: crea el asiento del expediente, otorga el XP
 * correspondiente (con idempotencia — una reevaluación solo añade la
 * diferencia positiva) y marca evaluaciones previas del mismo trabajo como
 * reemplazadas sin borrarlas (prompt maestro §4, §13).
 */
export async function acceptEvaluation(evaluationId: string): Promise<void> {
  const evaluation = await academicEvaluationsRepo.getById(evaluationId);
  if (!evaluation) throw new Error("La evaluación no existe.");
  const submission = await assignmentSubmissionsRepo.getById(evaluation.submission_id);
  if (!submission) throw new Error("La entrega no existe.");
  const assignment = await academicAssignmentsRepo.getById(submission.assignment_id);
  if (!assignment) throw new Error("El trabajo no existe.");

  const previousEvaluations = await academicEvaluationsRepo.list({
    where: "submission_id = ? AND status = 'aceptada' AND id != ?",
    params: [evaluation.submission_id, evaluationId],
  });
  for (const prev of previousEvaluations) {
    await academicEvaluationsRepo.update(prev.id, { status: "reemplazada" });
  }
  // También reemplaza el asiento previo del expediente (mismo trabajo), sin borrarlo.
  const previousTranscriptEntries = await academicTranscriptEntriesRepo.list({
    where: "assignment_id = ? AND status = 'vigente'",
    params: [assignment.id],
  });
  for (const entry of previousTranscriptEntries) {
    await academicTranscriptEntriesRepo.update(entry.id, { status: "reemplazada" });
  }

  await academicEvaluationsRepo.update(evaluationId, { status: "aceptada", accepted_at: now() });
  await academicAssignmentsRepo.update(assignment.id, { status: "aceptado" });

  await academicTranscriptEntriesRepo.insert({
    id: crypto.randomUUID(),
    subject_id: assignment.subject_id,
    assignment_id: assignment.id,
    evaluation_id: evaluationId,
    title: assignment.title,
    work_type: assignment.work_type,
    score_100: evaluation.total_score,
    score_10: evaluation.score_10,
    verdict: evaluation.verdict,
    status: "vigente",
    recorded_at: now(),
    updated_at: now(),
  });

  const category = categoryForWorkType(assignment.work_type);
  if (evaluation.total_score < 60) {
    await awardXp({
      sourceType: "academic_assignment",
      sourceId: assignment.id,
      subjectId: assignment.subject_id,
      category: "intento",
      score100: evaluation.total_score,
      reason: `Intento — ${assignment.title}`,
      rubricVersionId: evaluation.rubric_version_id,
    });
  } else {
    await awardXp({
      sourceType: "academic_assignment",
      sourceId: assignment.id,
      subjectId: assignment.subject_id,
      category,
      score100: evaluation.total_score,
      reason: assignment.title,
      rubricVersionId: evaluation.rubric_version_id,
    });
  }
}

export async function requestRevision(evaluationId: string): Promise<void> {
  await academicEvaluationsRepo.update(evaluationId, { status: "revision_requerida" });
}

export async function listEvaluationsForAssignment(assignmentId: string) {
  const submissions = await assignmentSubmissionsRepo.list({ where: "assignment_id = ?", params: [assignmentId] });
  const submissionIds = submissions.map((s) => s.id);
  if (submissionIds.length === 0) return [];
  const placeholders = submissionIds.map(() => "?").join(",");
  return academicEvaluationsRepo.list({
    where: `submission_id IN (${placeholders})`,
    params: submissionIds,
    orderBy: "created_at DESC",
  });
}

export async function getCriterionEvaluations(evaluationId: string) {
  return criterionEvaluationsRepo.list({ where: "evaluation_id = ?", params: [evaluationId] });
}
