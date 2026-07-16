import { describe, expect, it } from "vitest";
import { validateEvaluationResponse } from "@/schemas/evaluationResponse";

function baseResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rubricVersion: "v1.0",
    assignmentId: "assignment-1",
    totalScore: 85,
    score10: 8.5,
    criteria: [
      { criterionId: "comprension", score: 22, maximum: 25, justification: "Buen manejo conceptual.", evidence: [], weaknesses: [], requiredImprovements: [] },
      { criterionId: "razonamiento", score: 18, maximum: 20, justification: "Coherente.", evidence: [], weaknesses: [], requiredImprovements: [] },
      { criterionId: "evidencia", score: 13, maximum: 15, justification: "Cita fuentes.", evidence: [], weaknesses: [], requiredImprovements: [] },
      { criterionId: "aplicacion", score: 18, maximum: 20, justification: "Aplica bien.", evidence: [], weaknesses: [], requiredImprovements: [] },
      { criterionId: "critica", score: 8, maximum: 10, justification: "Reconoce límites.", evidence: [], weaknesses: [], requiredImprovements: [] },
      { criterionId: "claridad", score: 6, maximum: 10, justification: "Podría ser más claro.", evidence: [], weaknesses: [], requiredImprovements: [] },
    ],
    strengths: ["Buen argumento central"],
    criticalErrors: [],
    requiredRevisions: [],
    verdict: "advanced",
    confidence: 80,
    evaluatorNotes: "",
    ...overrides,
  };
}

describe("Validación de respuesta de evaluación (Zod)", () => {
  it("acepta una respuesta bien formada cuya suma de criterios coincide con totalScore", () => {
    const result = validateEvaluationResponse(baseResponse());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rechaza cuando la suma de los criterios no coincide con totalScore", () => {
    const result = validateEvaluationResponse(baseResponse({ totalScore: 95 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("no coincide"))).toBe(true);
  });

  it("rechaza cuando un criterio excede su máximo", () => {
    const bad = baseResponse();
    (bad.criteria as Record<string, unknown>[])[0]!.score = 30; // máximo es 25
    const result = validateEvaluationResponse(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("por encima de su máximo"))).toBe(true);
  });

  it("rechaza JSON incompleto (falta justification)", () => {
    const bad = baseResponse();
    delete (bad.criteria as Record<string, unknown>[])[0]!.justification;
    const result = validateEvaluationResponse(bad);
    expect(result.valid).toBe(false);
  });

  it("rechaza totalScore mayor a 100", () => {
    const result = validateEvaluationResponse(baseResponse({ totalScore: 120, score10: 12 }));
    expect(result.valid).toBe(false);
  });

  it("rechaza campos desconocidos (esquema estricto)", () => {
    const result = validateEvaluationResponse(baseResponse({ extraUnknownField: "sorpresa" }));
    expect(result.valid).toBe(false);
  });

  it("rechaza un verdict fuera del enum permitido", () => {
    const result = validateEvaluationResponse(baseResponse({ verdict: "perfecto" }));
    expect(result.valid).toBe(false);
  });
});
