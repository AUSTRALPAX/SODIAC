import { describe, expect, it } from "vitest";
import { computeTopicLearningState } from "@/services/learningState";

describe("computeTopicLearningState", () => {
  it("un tema sin ninguna señal está pendiente", () => {
    expect(computeTopicLearningState({ completedAt: null })).toBe("pendiente");
  });

  it("con al menos una sesión de estudio pasa a en_estudio", () => {
    expect(computeTopicLearningState({ completedAt: null, hasStudySession: true })).toBe("en_estudio");
  });

  it("con nota consolidada pasa a nota_consolidada", () => {
    expect(
      computeTopicLearningState({ completedAt: null, hasStudySession: true, hasConsolidatedNote: true }),
    ).toBe("nota_consolidada");
  });

  it("con validación pendiente pasa a validacion_pendiente aunque haya nota", () => {
    expect(
      computeTopicLearningState({
        completedAt: null,
        hasConsolidatedNote: true,
        validationStatus: "pendiente",
      }),
    ).toBe("validacion_pendiente");
  });

  it("con validación aprobada pasa a validacion_aprobada", () => {
    expect(
      computeTopicLearningState({
        completedAt: null,
        hasConsolidatedNote: true,
        validationStatus: "aprobada",
      }),
    ).toBe("validacion_aprobada");
  });

  it("completed_at siempre gana sobre el resto de las señales (salvo enfriado)", () => {
    expect(
      computeTopicLearningState({
        completedAt: "2026-01-01T00:00:00.000Z",
        validationStatus: "pendiente",
      }),
    ).toBe("dominado");
  });

  it("enfriado tiene prioridad sobre dominado — invita a repasar en vez de ocultar la urgencia", () => {
    expect(
      computeTopicLearningState({
        completedAt: "2026-01-01T00:00:00.000Z",
        reviewState: "enfriado",
      }),
    ).toBe("enfriado");
  });
});
