import { competenciesRepo, reviewsRepo, topicsRepo } from "@/database/entities";
import type { ReviewRow } from "@/database/types";
import {
  addDaysIso,
  computeNextSchedule,
  isCooled,
  INITIAL_SCHEDULE,
  type ReviewQuality,
  type ReviewSchedule,
} from "@/services/reviewSpacing";

const now = () => new Date().toISOString();

function parseSchedule(reasonFactors: string | null): ReviewSchedule {
  if (!reasonFactors) return INITIAL_SCHEDULE;
  try {
    const parsed = JSON.parse(reasonFactors) as { schedule?: ReviewSchedule };
    return parsed.schedule ?? INITIAL_SCHEDULE;
  } catch {
    return INITIAL_SCHEDULE;
  }
}

export interface ReviewWithContext extends ReviewRow {
  displayState: ReviewRow["state"];
  label: string;
  reasons: string[];
}

/**
 * El estado mostrado se deriva de la fecha, no solo del campo `state`
 * almacenado: un repaso "próximo" que ya pasó su fecha se muestra como
 * "vencido" sin necesidad de un job en segundo plano (docs/PRODUCT_SPEC.md,
 * prompt maestro §15 — mostrar claramente por qué se sugiere cada repaso).
 */
function computeDisplayState(review: ReviewRow): ReviewRow["state"] {
  const terminal: ReviewRow["state"][] = ["completado", "innecesario", "enfriado", "pospuesto"];
  if (terminal.includes(review.state)) return review.state;
  if (review.due_at && new Date(review.due_at) < new Date()) return "vencido";
  if (review.due_at) return "proximo";
  return "no_programado";
}

function buildReasons(review: ReviewRow, displayState: ReviewRow["state"]): string[] {
  const reasons: string[] = [];
  if (review.due_at) {
    const date = new Date(review.due_at).toLocaleDateString("es-AR");
    reasons.push(displayState === "vencido" ? `Estaba programado para el ${date}.` : `Programado para el ${date}.`);
  } else {
    reasons.push("No tiene fecha programada todavía.");
  }
  if (review.reason_factors) {
    try {
      const factors = JSON.parse(review.reason_factors) as Record<string, unknown>;
      if (factors.origen === "finalizar_estudio") reasons.push("Se generó al finalizar una sesión de estudio.");
    } catch {
      /* factores no parseables, se ignoran */
    }
  }
  return reasons;
}

export async function listReviewQueue(): Promise<ReviewWithContext[]> {
  const reviews = await reviewsRepo.list({ where: "archived_at IS NULL", orderBy: "due_at IS NULL, due_at ASC" });
  const result: ReviewWithContext[] = [];
  for (const review of reviews) {
    const [competency, topic] = await Promise.all([
      review.competency_id ? competenciesRepo.getById(review.competency_id) : Promise.resolve(null),
      review.topic_id ? topicsRepo.getById(review.topic_id) : Promise.resolve(null),
    ]);
    const displayState = computeDisplayState(review);
    result.push({
      ...review,
      displayState,
      label: topic?.title ?? competency?.title ?? "Repaso general",
      reasons: buildReasons(review, displayState),
    });
  }
  return result;
}

/**
 * Completa un repaso registrando qué tan bien salió (`quality`) y usa el
 * algoritmo de espaciado real (`reviewSpacing.ts`) para decidir qué pasa
 * después: si el intervalo resultante todavía es corto, programa
 * automáticamente el próximo repaso; si ya cruzó el umbral de enfriamiento,
 * crea un repaso "enfriado" en su lugar en vez de seguir reprogramando.
 */
export async function completeReview(id: string, quality: ReviewQuality): Promise<void> {
  const review = await reviewsRepo.getById(id);
  if (!review) return;

  const prevSchedule = parseSchedule(review.reason_factors);
  const nextSchedule = computeNextSchedule(prevSchedule, quality);
  const completedAt = now();

  await reviewsRepo.update(id, {
    state: "completado",
    completed_at: completedAt,
    reason_factors: JSON.stringify({
      ...safeParseFactors(review.reason_factors),
      quality,
      schedule: nextSchedule,
    }),
  });

  const cooled = isCooled(nextSchedule);
  const next: ReviewRow = {
    id: crypto.randomUUID(),
    competency_id: review.competency_id,
    topic_id: review.topic_id,
    evidence_id: null,
    due_at: cooled ? null : addDaysIso(completedAt, nextSchedule.intervalDays),
    state: cooled ? "enfriado" : "proximo",
    reason_factors: JSON.stringify({
      origen: cooled ? "enfriamiento_automatico" : "repaso_programado",
      previous_review_id: id,
      schedule: nextSchedule,
    }),
    completed_at: null,
    status: "activo",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: completedAt,
    updated_at: completedAt,
    archived_at: null,
  };
  await reviewsRepo.insert(next);
}

function safeParseFactors(reasonFactors: string | null): Record<string, unknown> {
  if (!reasonFactors) return {};
  try {
    return JSON.parse(reasonFactors) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function postponeReview(id: string, newDueAt: string): Promise<void> {
  await reviewsRepo.update(id, { state: "pospuesto", due_at: newDueAt });
}

export async function markReviewUnnecessary(id: string): Promise<void> {
  await reviewsRepo.update(id, { state: "innecesario" });
}

export async function markReviewCooled(id: string): Promise<void> {
  await reviewsRepo.update(id, { state: "enfriado" });
}

export async function reactivateReview(id: string, dueAt: string | null): Promise<void> {
  await reviewsRepo.update(id, { state: dueAt ? "proximo" : "no_programado", due_at: dueAt });
}
