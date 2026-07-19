/**
 * Versionado del currículo (Fase 1 de la mejora integral). Cada ronda de
 * ampliación (nuevas materias/módulos) queda registrada como una fila
 * propia — nunca se sobrescribe la anterior. `subject.curriculum_version_id`/
 * `topic.curriculum_version_id` (nullable, migración 0016) permiten saber
 * más adelante qué entró en cada ronda, sin forzar un valor inventado en lo
 * que ya existía (todo lo actual quedó taggeado a `curriculum-v1`).
 */
import { curriculumVersionsRepo } from "@/database/entities";
import type { CurriculumVersionRow } from "@/database/types";

const now = () => new Date().toISOString();

export async function getCurrentCurriculumVersion(): Promise<CurriculumVersionRow> {
  const existing = await curriculumVersionsRepo.list({ where: "is_current = 1" });
  if (existing[0]) return existing[0];
  const version: CurriculumVersionRow = {
    id: crypto.randomUUID(),
    label: "Currículo fundacional",
    description: null,
    is_current: 1,
    created_at: now(),
    updated_at: now(),
  };
  await curriculumVersionsRepo.insert(version);
  return version;
}

/**
 * Registra una nueva ronda de ampliación curricular: crea la fila, la marca
 * como vigente y desmarca la anterior (sin borrarla — sigue siendo
 * consultable para saber qué materias/temas entraron en cada ronda).
 */
export async function registerCurriculumVersion(label: string, description?: string): Promise<CurriculumVersionRow> {
  const previous = await curriculumVersionsRepo.list({ where: "is_current = 1" });
  for (const p of previous) {
    await curriculumVersionsRepo.update(p.id, { is_current: 0 });
  }
  const version: CurriculumVersionRow = {
    id: crypto.randomUUID(),
    label,
    description: description ?? null,
    is_current: 1,
    created_at: now(),
    updated_at: now(),
  };
  await curriculumVersionsRepo.insert(version);
  return version;
}

export async function listCurriculumVersions(): Promise<CurriculumVersionRow[]> {
  return curriculumVersionsRepo.list({ orderBy: "created_at ASC" });
}
