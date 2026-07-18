import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALIDATION_QUESTIONS,
  MAX_VALIDATION_QUESTIONS,
  MIN_VALIDATION_QUESTIONS,
  generateValidationQuestions,
  verdictForScore,
} from "@/services/knowledgeValidation";

describe("generateValidationQuestions", () => {
  it("genera 5 preguntas por defecto", () => {
    expect(generateValidationQuestions("Elasticidad precio")).toHaveLength(DEFAULT_VALIDATION_QUESTIONS);
  });

  it("nunca genera menos de 3 ni más de 10, aunque se pida fuera de rango", () => {
    expect(generateValidationQuestions("Tema", 1)).toHaveLength(MIN_VALIDATION_QUESTIONS);
    expect(generateValidationQuestions("Tema", 50)).toHaveLength(MAX_VALIDATION_QUESTIONS);
  });

  it("cada pregunta incluye el título del tema", () => {
    const questions = generateValidationQuestions("Costo de oportunidad", 5);
    for (const q of questions) {
      expect(q.text).toContain("Costo de oportunidad");
    }
  });

  it("no repite el mismo tipo de pregunta dentro de un mismo set", () => {
    const questions = generateValidationQuestions("Tema", 8);
    const types = questions.map((q) => q.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("verdictForScore", () => {
  it("clasifica según los umbrales de la rúbrica (90/75/60/40)", () => {
    expect(verdictForScore(95)).toBe("outstanding");
    expect(verdictForScore(80)).toBe("advanced");
    expect(verdictForScore(65)).toBe("competent");
    expect(verdictForScore(45)).toBe("basic");
    expect(verdictForScore(20)).toBe("revision_required");
  });
});
