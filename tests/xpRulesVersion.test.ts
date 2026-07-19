import { beforeEach, describe, expect, it, vi } from "vitest";
import type { XpRulesVersionRow } from "@/database/types";

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

const { ensureCurrentXpRulesVersion, getResolvedXpRules, xpRequiredForLevelWithRules } = await import(
  "@/services/xpRulesVersion"
);

beforeEach(() => {
  xpRulesVersions = makeMemoryRepo<XpRulesVersionRow>([]);
});

describe("ensureCurrentXpRulesVersion", () => {
  it("crea una versión de respaldo con los mismos valores que estaban hardcodeados en xp.ts", async () => {
    const version = await ensureCurrentXpRulesVersion();
    expect(version.career_total_xp).toBe(100000);
    expect(version.max_level).toBe(100);
    expect(version.level_curve_exponent).toBeCloseTo(1.55);
    expect(version.graded_share).toBeCloseTo(0.7);
    expect(version.completion_share).toBeCloseTo(0.3);
    expect(JSON.parse(version.completion_category_weights_json)).toEqual({
      finalizacion_tarea_hito: 0.20,
      finalizacion_tema: 0.36,
      validacion_conocimiento: 0.24,
      cierre_materia: 0.20,
    });
  });

  it("no crea una segunda fila si ya existe una vigente", async () => {
    const first = await ensureCurrentXpRulesVersion();
    const second = await ensureCurrentXpRulesVersion();
    expect(second.id).toBe(first.id);
    expect(xpRulesVersions.rows.length).toBe(1);
  });
});

describe("xpRequiredForLevelWithRules — misma curva que xp.ts hoy (sin congelamiento)", () => {
  it("reproduce exactamente xpRequiredForLevel(level) = round(100000 * (level/100)^1.55)", async () => {
    const rules = await getResolvedXpRules();
    for (let level = 0; level <= 100; level += 5) {
      const expected = Math.round(100000 * Math.pow(level / 100, 1.55));
      expect(xpRequiredForLevelWithRules(level, rules)).toBe(expected);
    }
  });

  it("nivel 0 requiere 0 XP y nivel 100 requiere el total de la carrera", async () => {
    const rules = await getResolvedXpRules();
    expect(xpRequiredForLevelWithRules(0, rules)).toBe(0);
    expect(xpRequiredForLevelWithRules(100, rules)).toBe(100000);
  });
});

describe("xpRequiredForLevelWithRules — curva por tramos (para la recalibración de Fase 3)", () => {
  it("con un punto de congelamiento, los niveles ya alcanzados no cambian", async () => {
    const rules = {
      versionId: "v2",
      careerTotalXp: 150000,
      maxLevel: 100,
      levelCurveExponent: 1.55,
      gradedShare: 0.7,
      completionShare: 0.3,
      categoryWeights: {} as never,
      completionCategoryWeights: {} as never,
      frozenAtLevel: 20,
      frozenAtXp: Math.round(100000 * Math.pow(20 / 100, 1.55)),
    };
    // Nivel 20 (el congelado) exige exactamente lo mismo que exigía antes.
    expect(xpRequiredForLevelWithRules(20, rules)).toBe(rules.frozenAtXp);
    // Nivel 10 (por debajo del congelamiento) también usa la curva vieja.
    expect(xpRequiredForLevelWithRules(10, rules)).toBe(Math.round(100000 * Math.pow(10 / 100, 1.55)));
    // Nivel 100 (tope) exige el nuevo total ampliado.
    expect(xpRequiredForLevelWithRules(100, rules)).toBe(150000);
  });
});
