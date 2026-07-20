import { academicAttributesRepo, topicAttributeWeightsRepo, topicsRepo } from "@/database/entities";
import { getLatestMasteryByCompetency } from "@/services/mastery";

/**
 * "En qué te estás convirtiendo" (pedido original de la mejora integral):
 * puntaje ponderado de dominio por atributo académico, a partir de
 * `topic_attribute_weight` (solo poblado para los 62 temas de la Fase 2 —
 * los otros 492 no tienen relación asignada todavía, y eso es esperado: no
 * se inventan relaciones arbitrarias, es trabajo de autoría manual futuro).
 * La cobertura se reporta por separado del puntaje para que la UI nunca
 * finja que un atributo está completamente evaluado cuando no lo está.
 */
export interface AttributeScore {
  attributeId: string;
  code: string;
  name: string;
  /** Promedio ponderado de nivel de dominio (0-5) SOLO sobre temas evaluados. `null` si no hay ninguno todavía. */
  weightedMasteryLevel: number | null;
  /** `weightedMasteryLevel` expresado como porcentaje de 5 (para el eje del radar). `null` si no hay datos. */
  percentOf5: number | null;
  /** Cantidad de temas con un peso asignado a este atributo (evaluados + sin evaluar). */
  topicsClassified: number;
  /** De esos, cuántos tienen una evaluación de dominio real (vía competency_id). */
  topicsEvaluated: number;
}

export async function computeAttributeScores(): Promise<AttributeScore[]> {
  const [attributes, weights, topics, masteryByCompetency] = await Promise.all([
    academicAttributesRepo.list({ where: "status = 'activo'", orderBy: "sort_order" }),
    topicAttributeWeightsRepo.list({}),
    topicsRepo.list({ where: "archived_at IS NULL" }),
    getLatestMasteryByCompetency(),
  ]);

  const topicById = new Map(topics.map((t) => [t.id, t]));

  return attributes.map((attribute) => {
    const weightsForAttribute = weights.filter((w) => w.attribute_id === attribute.id);

    let weightedSum = 0;
    let weightSumEvaluated = 0;
    let topicsEvaluated = 0;

    for (const w of weightsForAttribute) {
      const topic = topicById.get(w.topic_id);
      if (!topic?.competency_id) continue;
      const mastery = masteryByCompetency.get(topic.competency_id);
      if (!mastery) continue;
      const weight = w.weight_pct / 100;
      weightedSum += weight * mastery.level;
      weightSumEvaluated += weight;
      topicsEvaluated++;
    }

    const weightedMasteryLevel = weightSumEvaluated > 0 ? weightedSum / weightSumEvaluated : null;

    return {
      attributeId: attribute.id,
      code: attribute.code,
      name: attribute.name,
      weightedMasteryLevel,
      percentOf5: weightedMasteryLevel != null ? (weightedMasteryLevel / 5) * 100 : null,
      topicsClassified: weightsForAttribute.length,
      topicsEvaluated,
    };
  });
}
