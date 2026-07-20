import { subjectsRepo, topicsRepo } from "@/database/entities";
import type { SubjectRow, TopicRow } from "@/database/types";

const MAX_RESULTS_PER_TYPE = 8;

export interface GlobalSearchResult {
  subjects: SubjectRow[];
  topics: TopicRow[];
}

/**
 * Búsqueda global (Fase 4) acotada a materias y temas del currículo por
 * título — decisión explícita del usuario de no indexar notas de Obsidian,
 * documentos ni recursos de biblioteca en esta fase.
 */
export async function searchGlobal(query: string): Promise<GlobalSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { subjects: [], topics: [] };

  const like = `%${trimmed}%`;
  const [subjects, topics] = await Promise.all([
    subjectsRepo.list({ where: "title LIKE ? AND archived_at IS NULL", params: [like], orderBy: "title" }),
    topicsRepo.list({ where: "title LIKE ? AND archived_at IS NULL", params: [like], orderBy: "title" }),
  ]);

  return {
    subjects: subjects.slice(0, MAX_RESULTS_PER_TYPE),
    topics: topics.slice(0, MAX_RESULTS_PER_TYPE),
  };
}
