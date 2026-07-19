/**
 * Algoritmo de espaciado real para repasos (Fase 7). Hasta ahora `review`
 * solo se creaba y posponía a mano, sin ningún criterio de retención — la
 * auditoría de Fase 1 marcó esto como genuinamente faltante, no reutilizable.
 *
 * Esquema simplificado tipo Leitner/SM-2: cada repaso completado avanza (o
 * reinicia) una racha de éxitos consecutivos, que mapea a una secuencia de
 * intervalos crecientes. No requiere una tabla nueva: el estado
 * `{ streak, intervalDays }` se guarda dentro de `review.reason_factors`
 * (ya es TEXT/JSON libre), igual que el resto de columnas "reason_factors"
 * ya usadas por el sistema.
 */

export type ReviewQuality = "otra_vez" | "dificil" | "bien" | "facil";

export interface ReviewSchedule {
  /** Repasos exitosos consecutivos (bien/fácil) sin fallar en el medio. */
  streak: number;
  intervalDays: number;
}

export const INITIAL_SCHEDULE: ReviewSchedule = { streak: 0, intervalDays: 0 };

/** Secuencia de intervalos (en días) por cada repaso exitoso consecutivo. */
const INTERVAL_STEPS_DAYS = [1, 3, 7, 16, 35, 75, 120];

/** A partir de este intervalo, el tema se considera retenido a largo plazo. */
export const COOLING_THRESHOLD_DAYS = 120;

export function computeNextSchedule(prev: ReviewSchedule, quality: ReviewQuality): ReviewSchedule {
  if (quality === "otra_vez") {
    return { streak: 0, intervalDays: INTERVAL_STEPS_DAYS[0]! };
  }
  if (quality === "dificil") {
    const base = prev.intervalDays > 0 ? prev.intervalDays : INTERVAL_STEPS_DAYS[0]!;
    return { streak: prev.streak, intervalDays: Math.max(INTERVAL_STEPS_DAYS[0]!, Math.round(base * 1.2)) };
  }
  const advance = quality === "facil" ? 2 : 1;
  const streak = prev.streak + advance;
  const stepIndex = Math.min(streak, INTERVAL_STEPS_DAYS.length - 1);
  return { streak, intervalDays: INTERVAL_STEPS_DAYS[stepIndex]! };
}

export function isCooled(schedule: ReviewSchedule): boolean {
  return schedule.intervalDays >= COOLING_THRESHOLD_DAYS;
}

export function addDaysIso(fromIso: string, days: number): string {
  const date = new Date(fromIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
