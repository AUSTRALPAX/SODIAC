import { masteryAssessmentsRepo } from "@/database/entities";
import type { MasteryAssessmentRow } from "@/database/types";

/**
 * El nivel de dominio vigente de una competencia es el de su evaluación
 * más reciente — nunca sube solo por marcar una tarea como completada
 * (docs/DATA_MODEL.md §5, prompt maestro §5).
 */
export async function getLatestMasteryByCompetency(): Promise<Map<string, MasteryAssessmentRow>> {
  const rows = await masteryAssessmentsRepo.list({ orderBy: "assessed_at DESC" });
  const map = new Map<string, MasteryAssessmentRow>();
  for (const row of rows) {
    if (!map.has(row.competency_id)) {
      map.set(row.competency_id, row);
    }
  }
  return map;
}

export const MASTERY_LEVEL_LABEL: Record<number, string> = {
  0: "Desconocido",
  1: "Reconocimiento superficial",
  2: "Explicación parcial",
  3: "Aplicación con ayuda",
  4: "Aplicación autónoma",
  5: "Crítica, enseñanza y adaptación",
};

export const MASTERY_LEVEL_COLOR: Record<number, string> = {
  0: "#6F7980",
  1: "#E6B85C",
  2: "#E6B85C",
  3: "#00D6C5",
  4: "#16F1DD",
  5: "#43D69A",
};
