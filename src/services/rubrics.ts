import {
  gradingRubricVersionsRepo,
  gradingRubricsRepo,
  rubricCriteriaRepo,
} from "@/database/entities";
import type { GradingRubricRow, GradingRubricVersionRow, RubricCriterionRow } from "@/database/types";

const now = () => new Date().toISOString();

export interface RubricCriterionInput {
  code: string;
  title: string;
  description?: string | null;
  weightPoints: number;
}

export interface RubricWithVersion extends GradingRubricRow {
  currentVersion: GradingRubricVersionRow | null;
  criteria: RubricCriterionRow[];
}

/**
 * Rúbrica general predeterminada (prompt maestro §6): 100 puntos totales,
 * repartidos en 6 criterios fijos. Se crea una sola vez (idempotente por título).
 */
const GENERAL_RUBRIC_CRITERIA: RubricCriterionInput[] = [
  { code: "comprension", title: "Comprensión conceptual", weightPoints: 25 },
  { code: "razonamiento", title: "Razonamiento y coherencia", weightPoints: 20 },
  { code: "evidencia", title: "Evidencia, precisión y fuentes", weightPoints: 15 },
  { code: "aplicacion", title: "Aplicación y resolución", weightPoints: 20 },
  { code: "critica", title: "Pensamiento crítico y reconocimiento de límites", weightPoints: 10 },
  { code: "claridad", title: "Claridad y comunicación", weightPoints: 10 },
];

export const GENERAL_RUBRIC_TITLE = "Rúbrica general";

async function insertVersionWithCriteria(
  rubricId: string,
  versionLabel: string,
  criteria: RubricCriterionInput[],
  changelog: string,
  replacesVersionId: string | null,
): Promise<GradingRubricVersionRow> {
  const totalPoints = criteria.reduce((sum, c) => sum + c.weightPoints, 0);
  const version: GradingRubricVersionRow = {
    id: crypto.randomUUID(),
    rubric_id: rubricId,
    version_label: versionLabel,
    total_points: totalPoints,
    changelog,
    status: "activa",
    replaces_version_id: replacesVersionId,
    created_at: now(),
    updated_at: now(),
  };
  await gradingRubricVersionsRepo.insert(version);

  for (const [index, criterion] of criteria.entries()) {
    const row: RubricCriterionRow = {
      id: crypto.randomUUID(),
      rubric_version_id: version.id,
      code: criterion.code,
      title: criterion.title,
      description: criterion.description ?? null,
      weight_points: criterion.weightPoints,
      sort_order: index,
    };
    await rubricCriteriaRepo.insert(row);
  }

  if (replacesVersionId) {
    await gradingRubricVersionsRepo.update(replacesVersionId, { status: "reemplazada" });
  }
  await gradingRubricsRepo.update(rubricId, { current_version_id: version.id });

  return version;
}

export interface CreateRubricInput {
  title: string;
  workType: string;
  description?: string | null;
  criteria: RubricCriterionInput[];
}

export async function createRubric(input: CreateRubricInput): Promise<RubricWithVersion> {
  const rubric: GradingRubricRow = {
    id: crypto.randomUUID(),
    title: input.title,
    work_type: input.workType,
    description: input.description ?? null,
    current_version_id: null,
    status: "activa",
    created_at: now(),
    updated_at: now(),
  };
  await gradingRubricsRepo.insert(rubric);
  const version = await insertVersionWithCriteria(rubric.id, "v1.0", input.criteria, "Versión inicial.", null);
  const criteria = await rubricCriteriaRepo.list({ where: "rubric_version_id = ?", params: [version.id] });
  return { ...rubric, current_version_id: version.id, currentVersion: version, criteria };
}

/**
 * Crea una nueva versión de la rúbrica cuando cambian criterios o pesos — nunca
 * se edita la versión anterior en silencio (prompt maestro §6).
 */
export async function reviseRubric(
  rubricId: string,
  criteria: RubricCriterionInput[],
  changelog: string,
): Promise<GradingRubricVersionRow> {
  const rubric = await gradingRubricsRepo.getById(rubricId);
  if (!rubric) throw new Error("La rúbrica no existe.");
  const previousVersionId = rubric.current_version_id;
  const previousVersions = await gradingRubricVersionsRepo.list({
    where: "rubric_id = ?",
    params: [rubricId],
    orderBy: "created_at DESC",
  });
  const nextLabel = `v${previousVersions.length + 1}.0`;
  return insertVersionWithCriteria(rubricId, nextLabel, criteria, changelog, previousVersionId);
}

export async function listRubrics(): Promise<RubricWithVersion[]> {
  const rubrics = await gradingRubricsRepo.list({ where: "status = 'activa'", orderBy: "title" });
  const result: RubricWithVersion[] = [];
  for (const rubric of rubrics) {
    const currentVersion = rubric.current_version_id
      ? await gradingRubricVersionsRepo.getById(rubric.current_version_id)
      : null;
    const criteria = currentVersion
      ? await rubricCriteriaRepo.list({
          where: "rubric_version_id = ?",
          params: [currentVersion.id],
          orderBy: "sort_order",
        })
      : [];
    result.push({ ...rubric, currentVersion, criteria });
  }
  return result;
}

export async function getRubricVersion(versionId: string): Promise<{
  version: GradingRubricVersionRow;
  criteria: RubricCriterionRow[];
} | null> {
  const version = await gradingRubricVersionsRepo.getById(versionId);
  if (!version) return null;
  const criteria = await rubricCriteriaRepo.list({
    where: "rubric_version_id = ?",
    params: [versionId],
    orderBy: "sort_order",
  });
  return { version, criteria };
}

export async function archiveRubric(rubricId: string): Promise<void> {
  await gradingRubricsRepo.update(rubricId, { status: "archivada" });
}

export async function duplicateRubric(rubricId: string, newTitle: string): Promise<RubricWithVersion> {
  const rubric = await gradingRubricsRepo.getById(rubricId);
  if (!rubric?.current_version_id) throw new Error("La rúbrica no tiene una versión vigente.");
  const criteria = await rubricCriteriaRepo.list({
    where: "rubric_version_id = ?",
    params: [rubric.current_version_id],
    orderBy: "sort_order",
  });
  return createRubric({
    title: newTitle,
    workType: rubric.work_type,
    description: rubric.description,
    criteria: criteria.map((c) => ({
      code: c.code,
      title: c.title,
      description: c.description,
      weightPoints: c.weight_points,
    })),
  });
}

/**
 * Siembra la rúbrica general (100 puntos) y las específicas por tipo de trabajo,
 * solo si todavía no existen (idempotente por título).
 */
export async function ensureDefaultRubrics(): Promise<void> {
  const existing = await gradingRubricsRepo.list({ where: "title = ?", params: [GENERAL_RUBRIC_TITLE] });
  if (existing.length === 0) {
    await createRubric({
      title: GENERAL_RUBRIC_TITLE,
      workType: "general",
      description: "Rúbrica predeterminada aplicable a cualquier tipo de trabajo académico.",
      criteria: GENERAL_RUBRIC_CRITERIA,
    });
  }

  const specificWorkTypes: { title: string; workType: string; criteria: RubricCriterionInput[] }[] = [
    { title: "Rúbrica — Nota conceptual", workType: "nota_conceptual", criteria: GENERAL_RUBRIC_CRITERIA },
    { title: "Rúbrica — Ejercicio", workType: "ejercicio", criteria: GENERAL_RUBRIC_CRITERIA },
    { title: "Rúbrica — Ensayo", workType: "ensayo", criteria: GENERAL_RUBRIC_CRITERIA },
    { title: "Rúbrica — Análisis aplicado", workType: "analisis_empresarial", criteria: GENERAL_RUBRIC_CRITERIA },
    { title: "Rúbrica — Proyecto", workType: "proyecto", criteria: GENERAL_RUBRIC_CRITERIA },
    { title: "Rúbrica — Examen", workType: "examen", criteria: GENERAL_RUBRIC_CRITERIA },
    { title: "Rúbrica — Defensa", workType: "defensa", criteria: GENERAL_RUBRIC_CRITERIA },
    { title: "Rúbrica — Trabajo final de materia", workType: "producto_integrador", criteria: GENERAL_RUBRIC_CRITERIA },
  ];

  for (const spec of specificWorkTypes) {
    const found = await gradingRubricsRepo.list({ where: "title = ?", params: [spec.title] });
    if (found.length === 0) {
      await createRubric({ title: spec.title, workType: spec.workType, criteria: spec.criteria });
    }
  }
}
