import { topicAttributeWeightsRepo, topicsRepo } from "@/database/entities";

/**
 * Asignación puntual de target_mastery_level y topic_attribute_weight para
 * los 62 temas nuevos de la Fase 2 (ampliación curricular). Se identifican
 * por curriculum_unit_id, no por rango de fechas, para que sea seguro
 * volver a correr esta función sin duplicar filas (topic_attribute_weight
 * tiene UNIQUE(topic_id, attribute_id) y el update de nivel es idempotente).
 */
const UNIT_ATTRIBUTES: Record<string, { attributeIds: string[] }> = {
  "03b1325e-4cfd-4a4d-af2f-15a65ee2a1e9": { attributeIds: ["attr-produccion-conocimiento"] }, // Ciencia del aprendizaje
  "788414c8-2d12-4369-b4b4-3a703ad8cded": { attributeIds: ["attr-instituciones-derecho"] }, // Derecho, cumplimiento y riesgo regulatorio
  "da4876c6-0bbc-40c8-8a8c-ef8f08382b32": { attributeIds: ["attr-asignacion-capital", "attr-empresa"] }, // Gobierno corporativo
  "14843bde-4834-4ef8-a419-f5bcb5e9b393": { attributeIds: ["attr-economia"] }, // Historia económica argentina y latinoamericana en profundidad
  "02a78d53-1456-41a5-88f7-495ab17d01f5": { attributeIds: ["attr-pensamiento"] }, // Modelado de sistemas y dinámica aplicada
  "6ee60c84-c887-48d8-b60c-494313f551b3": { attributeIds: ["attr-metodos-cuantitativos"] }, // Probabilidad e incertidumbre
  "11779b64-06f2-4059-9089-ea95cad6a058": { attributeIds: ["attr-metodos-cuantitativos"] }, // Estadística aplicada — profundización
  "40d98870-a6a5-4d87-b77e-cf5bc6df992b": { attributeIds: ["attr-metodos-cuantitativos"] }, // Inferencia causal
  "705b07c0-29d3-4e8d-b08d-50312b5ca00b": { attributeIds: ["attr-metodos-cuantitativos"] }, // Econometría y finanzas empíricas — profundización
};

const DEFAULT_TARGET_MASTERY_LEVEL = 3;

export interface Fase2AttributeAssignmentResult {
  topicsUpdated: number;
  weightsCreated: number;
  topicsSkipped: number;
}

export async function assignFase2TopicAttributes(): Promise<Fase2AttributeAssignmentResult> {
  let topicsUpdated = 0;
  let weightsCreated = 0;
  let topicsSkipped = 0;

  for (const [unitId, mapping] of Object.entries(UNIT_ATTRIBUTES)) {
    const topics = await topicsRepo.list({ where: "curriculum_unit_id = ?", params: [unitId] });
    const existingWeights = await topicAttributeWeightsRepo.list({});
    const weightPct = Math.round(100 / mapping.attributeIds.length);

    for (const topic of topics) {
      if (topic.target_mastery_level == null) {
        await topicsRepo.update(topic.id, { target_mastery_level: DEFAULT_TARGET_MASTERY_LEVEL }, "sistema");
        topicsUpdated += 1;
      } else {
        topicsSkipped += 1;
      }

      for (const attributeId of mapping.attributeIds) {
        const already = existingWeights.some((w) => w.topic_id === topic.id && w.attribute_id === attributeId);
        if (already) continue;
        await topicAttributeWeightsRepo.insert(
          {
            id: crypto.randomUUID(),
            topic_id: topic.id,
            attribute_id: attributeId,
            weight_pct: weightPct,
            created_at: new Date().toISOString(),
          },
          "sistema",
        );
        weightsCreated += 1;
      }
    }
  }

  return { topicsUpdated, weightsCreated, topicsSkipped };
}
