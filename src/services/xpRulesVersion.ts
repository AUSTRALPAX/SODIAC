/**
 * Versionado de las reglas de XP (Fase 1 de la mejora integral). Antes,
 * `xp.ts` tenía los pesos y la curva de nivel como constantes de módulo sin
 * ningún registro de "qué reglas estaban vigentes cuando se otorgó tal XP".
 * Mismo patrón ya probado que `ensureCurrentFormulaVersion` en progress.ts:
 * se lee la fila `is_current = 1` en cada llamada (sin caché en memoria,
 * SQLite es rápido y así no hay que invalidar nada) y, si no existiera
 * (por ejemplo en un test que no corrió la migración), se crea una de
 * respaldo con los mismos valores que ya estaban hardcodeados.
 */
import { xpRulesVersionsRepo } from "@/database/entities";
import type { CompletionXpCategory, XpCategory, XpRulesVersionRow } from "@/database/types";

const now = () => new Date().toISOString();

const DEFAULT_CATEGORY_WEIGHTS: Record<Exclude<XpCategory, CompletionXpCategory>, number> = {
  notas_conceptuales: 0.10,
  ejercicios_practicas: 0.20,
  aplicaciones_casos: 0.25,
  proyecto_examen_integrador: 0.30,
  hitos_dominio: 0.10,
  revision_diferida_retencion: 0.05,
  intento: 0,
};

const DEFAULT_COMPLETION_CATEGORY_WEIGHTS: Record<CompletionXpCategory, number> = {
  finalizacion_tarea_hito: 0.20,
  finalizacion_tema: 0.36,
  validacion_conocimiento: 0.24,
  cierre_materia: 0.20,
};

export async function ensureCurrentXpRulesVersion(): Promise<XpRulesVersionRow> {
  const existing = await xpRulesVersionsRepo.list({ where: "is_current = 1" });
  if (existing[0]) return existing[0];
  const version: XpRulesVersionRow = {
    id: crypto.randomUUID(),
    label: "Reglas de XP fundacionales",
    career_total_xp: 100000,
    max_level: 100,
    level_curve_exponent: 1.55,
    graded_share: 0.7,
    completion_share: 0.3,
    category_weights_json: JSON.stringify(DEFAULT_CATEGORY_WEIGHTS),
    completion_category_weights_json: JSON.stringify(DEFAULT_COMPLETION_CATEGORY_WEIGHTS),
    frozen_at_level: null,
    frozen_at_xp: null,
    is_current: 1,
    created_at: now(),
    updated_at: now(),
    notes: null,
  };
  await xpRulesVersionsRepo.insert(version);
  return version;
}

export interface ResolvedXpRules {
  versionId: string;
  careerTotalXp: number;
  maxLevel: number;
  levelCurveExponent: number;
  gradedShare: number;
  completionShare: number;
  categoryWeights: Record<Exclude<XpCategory, CompletionXpCategory>, number>;
  completionCategoryWeights: Record<CompletionXpCategory, number>;
  frozenAtLevel: number | null;
  frozenAtXp: number | null;
}

export async function getResolvedXpRules(): Promise<ResolvedXpRules> {
  const version = await ensureCurrentXpRulesVersion();
  return {
    versionId: version.id,
    careerTotalXp: version.career_total_xp,
    maxLevel: version.max_level,
    levelCurveExponent: version.level_curve_exponent,
    gradedShare: version.graded_share,
    completionShare: version.completion_share,
    categoryWeights: JSON.parse(version.category_weights_json),
    completionCategoryWeights: JSON.parse(version.completion_category_weights_json),
    frozenAtLevel: version.frozen_at_level,
    frozenAtXp: version.frozen_at_xp,
  };
}

/**
 * Curva de nivel por tramos: mientras no haya un punto de congelamiento
 * (`frozenAtLevel`, todavía null en la v1), es la curva simple de siempre.
 * Una futura recalibración (Fase 3) va a completar `frozenAtLevel`/
 * `frozenAtXp` en una nueva versión para poder subir `careerTotalXp` sin
 * que nadie baje de nivel: los niveles ya alcanzados quedan exactamente
 * como estaban, solo los niveles futuros usan la escala nueva.
 */
export function xpRequiredForLevelWithRules(level: number, rules: ResolvedXpRules): number {
  if (level <= 0) return 0;
  const { frozenAtLevel, frozenAtXp, careerTotalXp, maxLevel, levelCurveExponent } = rules;

  if (frozenAtLevel == null || frozenAtXp == null || frozenAtLevel <= 0) {
    return Math.round(careerTotalXp * Math.pow(level / maxLevel, levelCurveExponent));
  }

  if (level <= frozenAtLevel) {
    // Tramo congelado: reconstruye el total de carrera VIEJO a partir del
    // único punto de anclaje (frozenAtLevel, frozenAtXp) — nunca usa
    // careerTotalXp acá, porque ese ya es el total nuevo/ampliado. Así
    // cualquier nivel ya alcanzado exige exactamente lo mismo que antes.
    const oldCareerTotalXp = frozenAtXp / Math.pow(frozenAtLevel / maxLevel, levelCurveExponent);
    return Math.round(oldCareerTotalXp * Math.pow(level / maxLevel, levelCurveExponent));
  }

  // Tramo superior: continuo en frozenAtLevel, llega a careerTotalXp (el nuevo total) en maxLevel.
  const span = maxLevel - frozenAtLevel;
  const progress = span > 0 ? (level - frozenAtLevel) / span : 1;
  return Math.round(frozenAtXp + (careerTotalXp - frozenAtXp) * progress);
}
