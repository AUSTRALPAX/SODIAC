/**
 * Vocabulario ampliado de estados de aprendizaje de un tema (sección 10-11
 * del pedido "Flujo de trabajo, historial de conocimiento y validación").
 *
 * No es una máquina de estados que bloquee el completar un tema — es un
 * estado calculado, solo para mostrar el momento real en el que está el
 * tema. `topic.status`/`topic.completed_at` en la base siguen siendo la
 * fuente de verdad para el gate de completitud (completionXp.ts); esto es
 * una capa de lectura encima, pensada para enriquecerse en fases futuras
 * (nota consolidada real, validación de conocimiento, repaso) sin tener
 * que cambiar cómo se calcula el XP ni el gate de la materia.
 */

export type TopicLearningState =
  | "pendiente"
  | "en_estudio"
  | "nota_consolidada"
  | "validacion_pendiente"
  | "validacion_aprobada"
  | "dominado"
  | "enfriado"
  | "reabierto";

export const TOPIC_LEARNING_STATE_LABELS: Record<TopicLearningState, string> = {
  pendiente: "Pendiente",
  en_estudio: "En estudio",
  nota_consolidada: "Nota consolidada",
  validacion_pendiente: "Validación pendiente",
  validacion_aprobada: "Validación aprobada",
  dominado: "Dominado",
  enfriado: "Enfriado",
  reabierto: "Reabierto",
};

export interface TopicLearningStateInput {
  completedAt: string | null;
  /** Señal opcional — llega en una fase futura (vínculo real con Obsidian). */
  hasConsolidatedNote?: boolean;
  /** Señal opcional — llega con la validación de conocimiento (fase 4). */
  validationStatus?: "pendiente" | "aprobada" | null;
  /** Señal opcional — llega del sistema de repasos. */
  reviewState?: string | null;
  /** Señal opcional — hubo al menos una sesión de estudio sobre este tema. */
  hasStudySession?: boolean;
}

/**
 * Devuelve el único estado más relevante para mostrar — nunca una lista de
 * los 8 posibles. El orden de las comprobaciones es intencional: un tema
 * dominado que se enfrió se muestra "enfriado" (para invitar al repaso),
 * no "dominado" (que ya no reflejaría la urgencia real).
 */
export function computeTopicLearningState(input: TopicLearningStateInput): TopicLearningState {
  if (input.reviewState === "enfriado") return "enfriado";
  if (input.completedAt) return "dominado";
  if (input.validationStatus === "aprobada") return "validacion_aprobada";
  if (input.validationStatus === "pendiente") return "validacion_pendiente";
  if (input.hasConsolidatedNote) return "nota_consolidada";
  if (input.hasStudySession) return "en_estudio";
  return "pendiente";
}

export const TOPIC_LEARNING_STATE_TONE: Record<TopicLearningState, "muted" | "accent" | "success" | "warning"> = {
  pendiente: "muted",
  en_estudio: "accent",
  nota_consolidada: "accent",
  validacion_pendiente: "warning",
  validacion_aprobada: "success",
  dominado: "success",
  enfriado: "warning",
  reabierto: "accent",
};
