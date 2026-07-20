import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubjectRow, XpRulesVersionRow } from "@/database/types";

function makeMemoryRepo<T extends { id: string }>(seed: T[] = []) {
  const rows = [...seed];
  return {
    rows,
    async list(options: { where?: string } = {}) {
      if (options.where === "is_current = 1") return rows.filter((r) => (r as unknown as { is_current: number }).is_current === 1);
      return [...rows];
    },
    async insert(row: T) {
      rows.push(row);
      return row;
    },
  };
}

let xpRulesVersions: ReturnType<typeof makeMemoryRepo<XpRulesVersionRow>>;

vi.mock("@/database/entities", () => ({
  get xpRulesVersionsRepo() {
    return xpRulesVersions;
  },
}));

const {
  CAREER_TOTAL_XP,
  COMPLETION_SHARE,
  GRADED_SHARE,
  MAX_LEVEL,
  computeSubjectBudgetShare,
  levelFromXp,
  scoreMultiplier,
  xpRequiredForLevel,
} = await import("@/services/xp");

beforeEach(() => {
  // Fila "is_current = 1" con los mismos valores que estaban hardcodeados —
  // este archivo prueba el refactor de CÓMO se lee el valor (en vivo desde
  // xp_rules_version), no un cambio de expectativas numéricas.
  xpRulesVersions = makeMemoryRepo<XpRulesVersionRow>([
    {
      id: "xp-rules-v1",
      label: "Reglas de XP fundacionales",
      career_total_xp: CAREER_TOTAL_XP,
      max_level: MAX_LEVEL,
      level_curve_exponent: 1.55,
      graded_share: GRADED_SHARE,
      completion_share: COMPLETION_SHARE,
      category_weights_json: JSON.stringify({
        notas_conceptuales: 0.10,
        ejercicios_practicas: 0.20,
        aplicaciones_casos: 0.25,
        proyecto_examen_integrador: 0.30,
        hitos_dominio: 0.10,
        revision_diferida_retencion: 0.05,
        intento: 0,
      }),
      completion_category_weights_json: JSON.stringify({
        finalizacion_tarea_hito: 0.20,
        finalizacion_tema: 0.36,
        validacion_conocimiento: 0.24,
        cierre_materia: 0.20,
      }),
      frozen_at_level: null,
      frozen_at_xp: null,
      is_current: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      notes: null,
    },
  ]);
});

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
  it("nivel 0 requiere 0 XP y nivel 100 requiere exactamente 100.000 XP", async () => {
    expect(await xpRequiredForLevel(0)).toBe(0);
    expect(await xpRequiredForLevel(MAX_LEVEL)).toBe(CAREER_TOTAL_XP);
  });

  it("es monótona creciente", async () => {
    let previous = -1;
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const xp = await xpRequiredForLevel(level);
      expect(xp).toBeGreaterThanOrEqual(previous);
      previous = xp;
    }
  });

  it("los primeros niveles avanzan más rápido que los últimos (curva convexa)", async () => {
    const early = (await xpRequiredForLevel(10)) - (await xpRequiredForLevel(0));
    const late = (await xpRequiredForLevel(100)) - (await xpRequiredForLevel(90));
    expect(early).toBeLessThan(late);
  });

  it("levelFromXp invierte xpRequiredForLevel para cada nivel exacto", async () => {
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const xp = await xpRequiredForLevel(level);
      expect(await levelFromXp(xp)).toBe(level);
    }
  });

  it("levelFromXp nunca excede el nivel máximo ni baja de 0", async () => {
    expect(await levelFromXp(0)).toBe(0);
    expect(await levelFromXp(-100)).toBe(0);
    expect(await levelFromXp(CAREER_TOTAL_XP * 2)).toBe(MAX_LEVEL);
  });
});

describe("Presupuesto de XP dinámico por materia (se recalcula en vivo, nunca guardado)", () => {
  it("reparte el techo de carrera proporcionalmente a los créditos entre las materias activas", async () => {
    const subjects = [fakeSubject("a", 3), fakeSubject("b", 3), fakeSubject("c", 4)];
    const shareA = await computeSubjectBudgetShare(subjects[0]!, subjects);
    const shareC = await computeSubjectBudgetShare(subjects[2]!, subjects);
    expect(shareA.graded + shareA.completion).toBeCloseTo(shareA.graded + shareA.completion);
    // "c" tiene más créditos que "a" (4 vs 3) → debe recibir más presupuesto.
    expect(shareC.graded).toBeGreaterThan(shareA.graded);
    // La suma de los tres presupuestos calificados debe agotar exactamente el 70% del techo.
    let totalGraded = 0;
    let totalCompletion = 0;
    for (const s of subjects) {
      const share = await computeSubjectBudgetShare(s, subjects);
      totalGraded += share.graded;
      totalCompletion += share.completion;
    }
    expect(totalGraded).toBeCloseTo(CAREER_TOTAL_XP * GRADED_SHARE);
    expect(totalCompletion).toBeCloseTo(CAREER_TOTAL_XP * COMPLETION_SHARE);
  });

  it("agregar una materia nueva reduce automáticamente el presupuesto de las demás, sin ningún paso manual", async () => {
    const before = [fakeSubject("a", 3), fakeSubject("b", 3)];
    const shareBefore = await computeSubjectBudgetShare(before[0]!, before);

    const after = [...before, fakeSubject("c", 3)];
    const shareAfter = await computeSubjectBudgetShare(after[0]!, after);

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
