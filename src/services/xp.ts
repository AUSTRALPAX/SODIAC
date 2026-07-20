import {
  academicLevelHistoryRepo,
  subjectsRepo,
  xpEventsRepo,
} from "@/database/entities";
import type { CompletionXpCategory, SubjectRow, XpCategory, XpEventRow } from "@/database/types";
import {
  ensureCurrentXpRulesVersion,
  getResolvedXpRules,
  xpRequiredForLevelWithRules,
} from "@/services/xpRulesVersion";

const now = () => new Date().toISOString();

/**
 * Estas constantes ya NO son la fuente de verdad en tiempo de ejecución —
 * quedan exportadas solo como valores de referencia/documentación (y como
 * seed de respaldo en `xpRulesVersion.ts`, que debe coincidir). Todas las
 * funciones de este archivo leen la fila `is_current = 1` de
 * `xp_rules_version` en vivo (vía `getResolvedXpRules()`), así que subir
 * `CAREER_TOTAL_XP` (o cualquier otro peso) es una migración de datos, no
 * un cambio de código — y la curva por tramos de `xpRequiredForLevelWithRules`
 * ya soporta recalibrar sin bajarle el nivel a nadie el día que haga falta.
 */
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

/**
 * Distribución dentro del presupuesto de finalización de una materia.
 *
 * `finalizacion_tema` representaba el 100% del XP de completar un tema
 * (0.60 del presupuesto de finalización). Con la validación de conocimiento
 * (fase 4 del pedido "Flujo de trabajo"), ese 0.60 se reparte: 40% pasa a
 * `validacion_conocimiento` (otorgado al aceptar una validación aprobada) y
 * el 60% restante (0.36) queda en `finalizacion_tema` (marcar completado sin
 * pasar por validación — sesión + nota + repaso combinados, hasta que una
 * fase futura los separe más). Un tema que hace ambas cosas (completar +
 * validar) sigue sumando el mismo 0.60 total que antes — no se infla ni se
 * reduce el presupuesto de la materia, solo se reparte en más eventos.
 * `finalizacion_tarea_hito`/`cierre_materia` quedan sin cambios.
 */
export const COMPLETION_CATEGORY_WEIGHTS: Record<CompletionXpCategory, number> = {
  finalizacion_tarea_hito: 0.20,
  finalizacion_tema: 0.36,
  validacion_conocimiento: 0.24,
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
 * XP_materia = techo * peso_materia / suma_pesos_de_todas_las_materias
 * ACTIVAS (prompt maestro §12), usando `credits` (1-5) como peso. Se calcula
 * en vivo en cada otorgamiento y en cada pantalla que lo muestra — nunca se
 * guarda en `subject.budgeted_xp`/`completion_budgeted_xp` (esas columnas
 * quedan sin uso a partir de esta versión). Esto es deliberado: si mañana se
 * agrega o archiva una materia, el reparto de TODAS las demás se ajusta
 * automáticamente la próxima vez que se otorgue o se muestre XP, sin ningún
 * paso manual — y sin tocar los eventos de XP ya otorgados, que son
 * inmutables (solo cambia cuánto se otorga a partir de ahora).
 */
export async function computeSubjectBudgetShare(
  subject: SubjectRow,
  activeSubjects: SubjectRow[],
): Promise<{ graded: number; completion: number }> {
  const rules = await getResolvedXpRules();
  const totalCredits = activeSubjects.reduce((sum, s) => sum + s.credits, 0) || 1;
  const share = subject.credits / totalCredits;
  return {
    graded: rules.careerTotalXp * rules.gradedShare * share,
    completion: rules.careerTotalXp * rules.completionShare * share,
  };
}

export interface SubjectXpBudgetView {
  subjectId: string;
  title: string;
  credits: number;
  gradedBudget: number;
  completionBudget: number;
  totalBudget: number;
  earnedXp: number;
}

/** Reparto vigente de todas las materias activas — siempre en vivo, nunca un valor guardado. */
export async function listSubjectXpBudgets(): Promise<SubjectXpBudgetView[]> {
  const subjects = await subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" });
  const events = await xpEventsRepo.list();

  return Promise.all(
    subjects.map(async (s) => {
      const { graded, completion } = await computeSubjectBudgetShare(s, subjects);
      const earnedXp = events.filter((e) => e.subject_id === s.id).reduce((sum, e) => sum + e.amount, 0);
      return {
        subjectId: s.id,
        title: s.title,
        credits: s.credits,
        gradedBudget: Math.round(graded),
        completionBudget: Math.round(completion),
        totalBudget: Math.round(graded + completion),
        earnedXp,
      };
    }),
  );
}

/** Presupuesto vigente de una materia puntual — mismo cálculo que usa `awardXp`. */
export async function getSubjectXpBudgetTotal(subjectId: string): Promise<{ graded: number; completion: number; total: number }> {
  const subjects = await subjectsRepo.list({ where: "archived_at IS NULL" });
  const subject = subjects.find((s) => s.id === subjectId);
  if (!subject) return { graded: 0, completion: 0, total: 0 };
  const { graded, completion } = await computeSubjectBudgetShare(subject, subjects);
  return { graded, completion, total: graded + completion };
}

async function categoryBudgetForSubject(subject: SubjectRow, activeSubjects: SubjectRow[], category: XpCategory): Promise<number> {
  const rules = await getResolvedXpRules();
  const { graded, completion } = await computeSubjectBudgetShare(subject, activeSubjects);
  if (isCompletionCategory(category)) {
    return completion * rules.completionCategoryWeights[category];
  }
  return graded * rules.categoryWeights[category];
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
    const activeSubjects = await subjectsRepo.list({ where: "archived_at IS NULL" });
    const subject = activeSubjects.find((s) => s.id === input.subjectId);
    if (subject) {
      const categoryBudget = await categoryBudgetForSubject(subject, activeSubjects, input.category);
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

  const xpRulesVersion = await ensureCurrentXpRulesVersion();

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
    xp_rules_version_id: xpRulesVersion.id,
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
 * Curva de nivel no lineal (prompt maestro §16), leída en vivo desde
 * `xp_rules_version` — ver `xpRequiredForLevelWithRules` en `xpRulesVersion.ts`
 * para la curva por tramos que soporta recalibrar sin bajar a nadie de nivel.
 */
export async function xpRequiredForLevel(level: number): Promise<number> {
  const rules = await getResolvedXpRules();
  return xpRequiredForLevelWithRules(level, rules);
}

export async function levelFromXp(xpTotal: number): Promise<number> {
  if (xpTotal <= 0) return 0;
  const rules = await getResolvedXpRules();
  if (xpTotal >= rules.careerTotalXp) return rules.maxLevel;
  // La curva es monótona creciente: se puede invertir en forma cerrada y luego
  // ajustar por redondeo comparando contra xpRequiredForLevelWithRules.
  const estimated = rules.maxLevel * Math.pow(xpTotal / rules.careerTotalXp, 1 / rules.levelCurveExponent);
  let level = Math.floor(estimated);
  while (level < rules.maxLevel && xpRequiredForLevelWithRules(level + 1, rules) <= xpTotal) level++;
  while (level > 0 && xpRequiredForLevelWithRules(level, rules) > xpTotal) level--;
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
  const rules = await getResolvedXpRules();
  const level = await levelFromXp(xpTotal);
  const xpForCurrentLevel = await xpRequiredForLevel(level);
  const xpForNextLevel = level < rules.maxLevel ? await xpRequiredForLevel(level + 1) : null;
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
  const rules = await getResolvedXpRules();
  return total >= rules.careerTotalXp && attemptTotal < total * 0.5;
}
