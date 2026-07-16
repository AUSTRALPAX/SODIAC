import {
  academicLevelHistoryRepo,
  subjectsRepo,
  xpEventsRepo,
} from "@/database/entities";
import type { CompletionXpCategory, SubjectRow, XpCategory, XpEventRow } from "@/database/types";

const now = () => new Date().toISOString();

export const CAREER_TOTAL_XP = 100_000;
export const MAX_LEVEL = 100;

/**
 * Distribución interna del presupuesto de XP de una materia (prompt maestro §13).
 * Las notas conceptuales nunca pueden consumir más del 10 %.
 */
export const CATEGORY_WEIGHTS: Record<Exclude<XpCategory, CompletionXpCategory>, number> = {
  notas_conceptuales: 0.10,
  ejercicios_practicas: 0.20,
  aplicaciones_casos: 0.25,
  proyecto_examen_integrador: 0.30,
  hitos_dominio: 0.10,
  revision_diferida_retencion: 0.05,
  intento: 0, // "intento" no tiene presupuesto propio: se descuenta del presupuesto de su categoría real
};

/**
 * Segundo presupuesto de XP, independiente del de trabajo calificado
 * (`budgeted_xp` / `CATEGORY_WEIGHTS`): otorga XP directamente al finalizar
 * tareas/hitos, temas o materias desde el cierre de una sesión, sin pasar
 * por rúbrica ni ChatGPT. Ambos presupuestos se derivan del mismo techo de
 * carrera (`CAREER_TOTAL_XP`) pero nunca se mezclan ni se restan entre sí:
 * modificar uno no afecta los eventos ya otorgados por el otro.
 */
export const GRADED_SHARE = 0.7;
export const COMPLETION_SHARE = 0.3;

/** Distribución dentro del presupuesto de finalización de una materia. */
export const COMPLETION_CATEGORY_WEIGHTS: Record<CompletionXpCategory, number> = {
  finalizacion_tarea_hito: 0.20,
  finalizacion_tema: 0.60,
  cierre_materia: 0.20,
};

function isCompletionCategory(category: XpCategory): category is CompletionXpCategory {
  return category in COMPLETION_CATEGORY_WEIGHTS;
}

/** Multiplicador por calificación (prompt maestro §14) — nunca supera 100 %. */
export function scoreMultiplier(score100: number): number {
  if (score100 >= 90) return 1.0;
  if (score100 >= 80) return 0.90;
  if (score100 >= 70) return 0.78;
  if (score100 >= 60) return 0.60;
  if (score100 >= 50) return 0.35;
  return 0.10;
}

/**
 * XP_materia = 100000 * peso_materia / suma_pesos_de_todas_las_materias (prompt
 * maestro §12). Usa `credits` (1-5) como peso. No se ejecuta automáticamente:
 * requiere una llamada explícita (simulación + confirmación en la UI) para no
 * "modificar silenciosamente los eventos anteriores" de materias que ya
 * otorgaron XP.
 */
export interface SubjectXpBudget {
  subjectId: string;
  title: string;
  credits: number;
  currentBudgetedXp: number | null;
  proposedBudgetedXp: number;
  alreadyAwardedXp: number;
  hasHistory: boolean;
}

export async function simulateSubjectXpBudgets(): Promise<SubjectXpBudget[]> {
  const subjects = await subjectsRepo.list({ where: "archived_at IS NULL" });
  const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0) || 1;
  const events = await xpEventsRepo.list();

  return subjects.map((s) => {
    const alreadyAwardedXp = events
      .filter((e) => e.subject_id === s.id)
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      subjectId: s.id,
      title: s.title,
      credits: s.credits,
      currentBudgetedXp: s.budgeted_xp,
      proposedBudgetedXp: Math.round((CAREER_TOTAL_XP * s.credits) / totalCredits),
      alreadyAwardedXp,
      hasHistory: alreadyAwardedXp > 0,
    };
  });
}

/** Aplica la simulación — requiere confirmación explícita desde la UI. */
export async function applySubjectXpBudgets(budgets: SubjectXpBudget[]): Promise<void> {
  for (const b of budgets) {
    await subjectsRepo.update(b.subjectId, { budgeted_xp: b.proposedBudgetedXp });
  }
}

/**
 * Hermana de `simulateSubjectXpBudgets` para el presupuesto de finalización
 * (30 % del techo de carrera, ver `COMPLETION_SHARE`). Nunca toca
 * `budgeted_xp` — es un pool aditivo e independiente.
 */
export async function simulateCompletionXpBudgets(): Promise<SubjectXpBudget[]> {
  const subjects = await subjectsRepo.list({ where: "archived_at IS NULL" });
  const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0) || 1;
  const events = await xpEventsRepo.list();
  const completionTotalXp = CAREER_TOTAL_XP * COMPLETION_SHARE;

  return subjects.map((s) => {
    const alreadyAwardedXp = events
      .filter((e) => e.subject_id === s.id && isCompletionCategory(e.category))
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      subjectId: s.id,
      title: s.title,
      credits: s.credits,
      currentBudgetedXp: s.completion_budgeted_xp,
      proposedBudgetedXp: Math.round((completionTotalXp * s.credits) / totalCredits),
      alreadyAwardedXp,
      hasHistory: alreadyAwardedXp > 0,
    };
  });
}

export async function applyCompletionXpBudgets(budgets: SubjectXpBudget[]): Promise<void> {
  for (const b of budgets) {
    await subjectsRepo.update(b.subjectId, { completion_budgeted_xp: b.proposedBudgetedXp });
  }
}

function categoryBudgetForSubject(subject: SubjectRow, category: XpCategory): number {
  if (isCompletionCategory(category)) {
    const budget = subject.completion_budgeted_xp ?? 0;
    return budget * COMPLETION_CATEGORY_WEIGHTS[category];
  }
  const budget = subject.budgeted_xp ?? 0;
  return budget * CATEGORY_WEIGHTS[category];
}

export interface AwardXpInput {
  sourceType: string;
  sourceId: string;
  subjectId: string | null;
  category: XpCategory;
  score100: number;
  reason: string;
  rubricVersionId?: string | null;
  /** Cantidad de trabajos activos que comparten el presupuesto de esta categoría en la materia. */
  itemsSharingCategory?: number;
}

export interface AwardXpResult {
  event: XpEventRow | null;
  awardedAmount: number;
  alreadyAwardedForKey: number;
}

export interface PreviewXpResult {
  idempotencyKey: string;
  proposedAmount: number;
  alreadyAwardedForKey: number;
  /** Diferencia positiva pendiente — lo que realmente se otorgaría al confirmar. */
  diff: number;
}

async function computeXpPreview(input: AwardXpInput): Promise<{
  idempotencyKey: string;
  existingForKey: XpEventRow[];
  alreadyAwardedForKey: number;
  proposedAmount: number;
}> {
  const version = input.rubricVersionId ?? "sin_rubrica";
  const idempotencyKey = `${input.sourceType}:${input.sourceId}:${input.category}:${version}`;

  const existingForKey = await xpEventsRepo.list({
    where: "idempotency_key = ?",
    params: [idempotencyKey],
  });
  const alreadyAwardedForKey = existingForKey.reduce((sum, e) => sum + e.amount, 0);

  let proposedAmount = 0;
  const multiplier = scoreMultiplier(input.score100);
  if (input.subjectId) {
    const subject = await subjectsRepo.getById(input.subjectId);
    if (subject) {
      const categoryBudget = categoryBudgetForSubject(subject, input.category);
      const items = Math.max(1, input.itemsSharingCategory ?? 1);
      proposedAmount = (categoryBudget / items) * multiplier;
    }
  }

  return { idempotencyKey, existingForKey, alreadyAwardedForKey, proposedAmount };
}

/**
 * Calcula cuánto XP otorgaría `awardXp(input)` sin escribir nada — para
 * mostrar una previsualización ("+140 XP") antes de que el usuario confirme.
 */
export async function previewAwardXp(input: AwardXpInput): Promise<PreviewXpResult> {
  const { idempotencyKey, alreadyAwardedForKey, proposedAmount } = await computeXpPreview(input);
  const diff = Math.max(0, proposedAmount - alreadyAwardedForKey);
  return { idempotencyKey, proposedAmount, alreadyAwardedForKey, diff };
}

/**
 * Otorga XP de forma idempotente: la clave sourceType+sourceId+xpCategory+version
 * (prompt maestro §13) impide XP duplicado. Una reevaluación del mismo trabajo
 * solo puede otorgar la diferencia positiva pendiente — nunca se resta XP ya
 * otorgado (el dominio puede bajar; el XP histórico, no).
 */
export async function awardXp(input: AwardXpInput): Promise<AwardXpResult> {
  const { idempotencyKey, existingForKey, alreadyAwardedForKey, proposedAmount } = await computeXpPreview(input);

  const diff = proposedAmount - alreadyAwardedForKey;
  if (diff <= 0) {
    return { event: null, awardedAmount: 0, alreadyAwardedForKey };
  }

  // Reintento con la MISMA clave: usar un id secuencial adicional para no violar la unicidad.
  const finalKey = existingForKey.length > 0 ? `${idempotencyKey}:rev${existingForKey.length}` : idempotencyKey;

  const event: XpEventRow = {
    id: crypto.randomUUID(),
    date: now(),
    amount: Math.round(diff * 100) / 100,
    source_type: input.sourceType,
    source_id: input.sourceId,
    subject_id: input.subjectId,
    category: input.category,
    reason: input.reason,
    score: input.score100,
    multiplier: scoreMultiplier(input.score100),
    rubric_version_id: input.rubricVersionId ?? null,
    idempotency_key: finalKey,
    reversal_of: null,
    created_at: now(),
    metadata_json: null,
  };
  await xpEventsRepo.insert(event);
  await checkAndRecordLevelUp();

  return { event, awardedAmount: event.amount, alreadyAwardedForKey };
}

/** Pequeña experiencia de intento para trabajos que no llegan al mínimo académico (<60). */
export async function awardAttemptXp(
  sourceType: string,
  sourceId: string,
  subjectId: string | null,
  reason: string,
): Promise<AwardXpResult> {
  return awardXp({
    sourceType,
    sourceId,
    subjectId,
    category: "intento",
    score100: 40,
    reason,
  });
}

export async function getCareerXpTotal(): Promise<number> {
  const events = await xpEventsRepo.list();
  return events.reduce((sum, e) => sum + e.amount, 0);
}

export async function getSubjectXpTotal(subjectId: string): Promise<number> {
  const events = await xpEventsRepo.list({ where: "subject_id = ?", params: [subjectId] });
  return events.reduce((sum, e) => sum + e.amount, 0);
}

export async function listXpHistory(limit = 50): Promise<XpEventRow[]> {
  return xpEventsRepo.list({ orderBy: "date DESC", params: [] }).then((rows) => rows.slice(0, limit));
}

/**
 * Curva de nivel no lineal (prompt maestro §16):
 * XP_requerido(nivel) = round(100000 * (nivel/100)^1.55)
 * Los primeros niveles avanzan rápido; los últimos exigen mucha más evidencia.
 */
export function xpRequiredForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.round(CAREER_TOTAL_XP * Math.pow(level / MAX_LEVEL, 1.55));
}

export function levelFromXp(xpTotal: number): number {
  if (xpTotal <= 0) return 0;
  if (xpTotal >= CAREER_TOTAL_XP) return MAX_LEVEL;
  // La curva es monótona creciente: se puede invertir en forma cerrada y luego
  // ajustar por redondeo comparando contra xpRequiredForLevel.
  const estimated = MAX_LEVEL * Math.pow(xpTotal / CAREER_TOTAL_XP, 1 / 1.55);
  let level = Math.floor(estimated);
  while (level < MAX_LEVEL && xpRequiredForLevel(level + 1) <= xpTotal) level++;
  while (level > 0 && xpRequiredForLevel(level) > xpTotal) level--;
  return level;
}

export interface LevelProgress {
  level: number;
  xpTotal: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number | null;
  xpIntoLevel: number;
  xpNeededForNextLevel: number | null;
  percentOfLevel: number;
}

export async function getLevelProgress(): Promise<LevelProgress> {
  const xpTotal = await getCareerXpTotal();
  const level = levelFromXp(xpTotal);
  const xpForCurrentLevel = xpRequiredForLevel(level);
  const xpForNextLevel = level < MAX_LEVEL ? xpRequiredForLevel(level + 1) : null;
  const xpIntoLevel = xpTotal - xpForCurrentLevel;
  const xpNeededForNextLevel = xpForNextLevel != null ? xpForNextLevel - xpTotal : null;
  const levelSpan = xpForNextLevel != null ? xpForNextLevel - xpForCurrentLevel : 1;
  const percentOfLevel = levelSpan > 0 ? Math.min(100, (xpIntoLevel / levelSpan) * 100) : 100;

  return { level, xpTotal, xpForCurrentLevel, xpForNextLevel, xpIntoLevel, xpNeededForNextLevel, percentOfLevel };
}

async function checkAndRecordLevelUp(): Promise<void> {
  const { level, xpTotal } = await getLevelProgress();
  const lastRecord = await academicLevelHistoryRepo.list({ orderBy: "level DESC" });
  const highestRecorded = lastRecord[0]?.level ?? -1;
  if (level > highestRecorded) {
    for (let l = highestRecorded + 1; l <= level; l++) {
      await academicLevelHistoryRepo.insert({
        id: crypto.randomUUID(),
        level: l,
        xp_total_at: xpTotal,
        reached_at: now(),
      });
    }
  }
}

export async function getLevelHistory() {
  return academicLevelHistoryRepo.list({ orderBy: "level ASC" });
}

/**
 * Nivel 100 exige, además de los 100.000 XP, que no todo ese XP provenga de
 * "intentos" (prompt maestro §16 — no se puede llegar a 100 solo con
 * experiencia de intento). Los requisitos de materias obligatorias completadas
 * y proyecto final se verifican en services/progress.ts (getCareerProgress),
 * que combina esto con el IPA para la vista de Trayectoria.
 */
export async function isLevel100XpEligible(): Promise<boolean> {
  const events = await xpEventsRepo.list();
  const total = events.reduce((sum, e) => sum + e.amount, 0);
  const attemptTotal = events.filter((e) => e.category === "intento").reduce((sum, e) => sum + e.amount, 0);
  return total >= CAREER_TOTAL_XP && attemptTotal < total * 0.5;
}
