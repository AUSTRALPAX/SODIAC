import { z } from "zod";

/**
 * Esquema de la respuesta estructurada de "evaluación asistida por criterios"
 * (prompt maestro §8). Se valida estrictamente: campos desconocidos críticos,
 * sumas incorrectas o puntuaciones que exceden el máximo se rechazan antes de
 * llegar a crear una AcademicEvaluation.
 */
export const criterionResultSchema = z.object({
  criterionId: z.string().min(1),
  score: z.number().min(0),
  maximum: z.number().min(0),
  justification: z.string().min(1, "Cada criterio requiere una justificación."),
  evidence: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  requiredImprovements: z.array(z.string()).default([]),
});

export const evaluationResponseSchema = z
  .object({
    rubricVersion: z.string().min(1),
    assignmentId: z.string().min(1),
    totalScore: z.number().min(0).max(100),
    score10: z.number().min(0).max(10),
    criteria: z.array(criterionResultSchema).min(1, "La evaluación debe incluir al menos un criterio."),
    strengths: z.array(z.string()).default([]),
    criticalErrors: z.array(z.string()).default([]),
    requiredRevisions: z.array(z.string()).default([]),
    verdict: z.enum(["revision_required", "basic", "competent", "advanced", "outstanding"]),
    confidence: z.number().min(0).max(100),
    evaluatorNotes: z.string().default(""),
  })
  .strict();

export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;

export interface EvaluationValidationResult {
  valid: boolean;
  data: EvaluationResponse | null;
  errors: string[];
}

/**
 * Valida el JSON pegado por el usuario contra el esquema y, además, contra
 * reglas de coherencia que Zod solo no puede expresar: la suma de criterios
 * debe coincidir con totalScore, ningún criterio puede exceder su máximo, y
 * el máximo total no puede superar 100 (prompt maestro §8).
 */
export function validateEvaluationResponse(raw: unknown): EvaluationValidationResult {
  const parsed = evaluationResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      data: null,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`),
    };
  }

  const data = parsed.data;
  const errors: string[] = [];

  const criteriaSum = data.criteria.reduce((sum, c) => sum + c.score, 0);
  if (Math.round(criteriaSum) !== Math.round(data.totalScore)) {
    errors.push(
      `La suma de los criterios (${criteriaSum}) no coincide con totalScore (${data.totalScore}). No se calculó la nota desde los criterios.`,
    );
  }

  const maxSum = data.criteria.reduce((sum, c) => sum + c.maximum, 0);
  if (maxSum > 100) {
    errors.push(`La suma de los máximos de los criterios (${maxSum}) excede 100.`);
  }

  for (const c of data.criteria) {
    if (c.score > c.maximum) {
      errors.push(`El criterio ${c.criterionId} obtuvo ${c.score} puntos, por encima de su máximo (${c.maximum}).`);
    }
  }

  const expectedScore10 = Math.round((data.totalScore / 10) * 10) / 10;
  if (Math.abs(data.score10 - expectedScore10) > 0.15) {
    errors.push(`score10 (${data.score10}) no corresponde a totalScore/10 (${expectedScore10}).`);
  }

  return { valid: errors.length === 0, data, errors };
}
