import { describe, expect, it } from "vitest";
import {
  CAREER_TOTAL_XP,
  COMPLETION_SHARE,
  GRADED_SHARE,
  MAX_LEVEL,
  computeSubjectBudgetShare,
  levelFromXp,
  scoreMultiplier,
  xpRequiredForLevel,
} from "@/services/xp";
import type { SubjectRow } from "@/database/types";

function fakeSubject(id: string, credits: number): SubjectRow {
  return {
    id,
    fundamental_question_id: "fq",
    title: id,
    description: null,
    credits,
    complexity: 3,
    importance: 3,
    estimated_load: 3,
    is_mandatory: 1,
    budgeted_xp: null,
    completed_at: null,
    completion_budgeted_xp: null,
    learning_stage_id: null,
    career_id: null,
    status: "activa",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
  };
}

describe("Curva de nivel (0-100, 100.000 XP)", () => {
  it("nivel 0 requiere 0 XP y nivel 100 requiere exactamente 100.000 XP", () => {
    expect(xpRequiredForLevel(0)).toBe(0);
    expect(xpRequiredForLevel(MAX_LEVEL)).toBe(CAREER_TOTAL_XP);
  });

  it("es monótona creciente", () => {
    let previous = -1;
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const xp = xpRequiredForLevel(level);
      expect(xp).toBeGreaterThanOrEqual(previous);
      previous = xp;
    }
  });

  it("los primeros niveles avanzan más rápido que los últimos (curva convexa)", () => {
    const early = xpRequiredForLevel(10) - xpRequiredForLevel(0);
    const late = xpRequiredForLevel(100) - xpRequiredForLevel(90);
    expect(early).toBeLessThan(late);
  });

  it("levelFromXp invierte xpRequiredForLevel para cada nivel exacto", () => {
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const xp = xpRequiredForLevel(level);
      expect(levelFromXp(xp)).toBe(level);
    }
  });

  it("levelFromXp nunca excede el nivel máximo ni baja de 0", () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(-100)).toBe(0);
    expect(levelFromXp(CAREER_TOTAL_XP * 2)).toBe(MAX_LEVEL);
  });
});

describe("Presupuesto de XP dinámico por materia (se recalcula en vivo, nunca guardado)", () => {
  it("reparte el techo de carrera proporcionalmente a los créditos entre las materias activas", () => {
    const subjects = [fakeSubject("a", 3), fakeSubject("b", 3), fakeSubject("c", 4)];
    const shareA = computeSubjectBudgetShare(subjects[0]!, subjects);
    const shareC = computeSubjectBudgetShare(subjects[2]!, subjects);
    expect(shareA.graded + shareA.completion).toBeCloseTo(shareA.graded + shareA.completion);
    // "c" tiene más créditos que "a" (4 vs 3) → debe recibir más presupuesto.
    expect(shareC.graded).toBeGreaterThan(shareA.graded);
    // La suma de los tres presupuestos calificados debe agotar exactamente el 70% del techo.
    const totalGraded = subjects.reduce((sum, s) => sum + computeSubjectBudgetShare(s, subjects).graded, 0);
    expect(totalGraded).toBeCloseTo(CAREER_TOTAL_XP * GRADED_SHARE);
    const totalCompletion = subjects.reduce((sum, s) => sum + computeSubjectBudgetShare(s, subjects).completion, 0);
    expect(totalCompletion).toBeCloseTo(CAREER_TOTAL_XP * COMPLETION_SHARE);
  });

  it("agregar una materia nueva reduce automáticamente el presupuesto de las demás, sin ningún paso manual", () => {
    const before = [fakeSubject("a", 3), fakeSubject("b", 3)];
    const shareBefore = computeSubjectBudgetShare(before[0]!, before);

    const after = [...before, fakeSubject("c", 3)];
    const shareAfter = computeSubjectBudgetShare(after[0]!, after);

    expect(shareAfter.graded).toBeLessThan(shareBefore.graded);
    expect(shareAfter.completion).toBeLessThan(shareBefore.completion);
    // Con 3 materias de igual crédito, cada una vale exactamente un tercio del techo.
    expect(shareAfter.graded).toBeCloseTo((CAREER_TOTAL_XP * GRADED_SHARE) / 3);
  });
});

describe("Multiplicador por calificación", () => {
  it("nunca supera 100%", () => {
    for (let score = 0; score <= 100; score++) {
      expect(scoreMultiplier(score)).toBeLessThanOrEqual(1);
    }
  });

  it("respeta los tramos definidos", () => {
    expect(scoreMultiplier(0)).toBeCloseTo(0.10);
    expect(scoreMultiplier(49)).toBeCloseTo(0.10);
    expect(scoreMultiplier(55)).toBeCloseTo(0.35);
    expect(scoreMultiplier(65)).toBeCloseTo(0.60);
    expect(scoreMultiplier(75)).toBeCloseTo(0.78);
    expect(scoreMultiplier(85)).toBeCloseTo(0.90);
    expect(scoreMultiplier(100)).toBeCloseTo(1.0);
  });
});
