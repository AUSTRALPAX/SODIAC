import { getDb } from "@/database/client";
import { continuityPointsRepo, projectsRepo, subjectsRepo, topicsRepo } from "@/database/entities";

/**
 * "Ritmo y continuidad" (Fase 5): racha de días de estudio y el historial
 * de puntos de continuidad — ambos calculados en vivo a partir de datos
 * ya existentes (study_session, continuity_point), nunca precomputados.
 */
export interface StudyStreak {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function computeStudyStreak(): Promise<StudyStreak> {
  const db = await getDb();
  const rows = await db.select<{ day: string }[]>(
    `SELECT DISTINCT date(started_at) as day FROM study_session
     WHERE started_at IS NOT NULL AND closure_status != 'cancelada'
     ORDER BY day DESC`,
  );
  const days = rows.map((r) => r.day);
  if (days.length === 0) return { currentStreak: 0, longestStreak: 0, lastStudyDate: null };

  const daySet = new Set(days);
  const today = toIsoDate(new Date());
  const yesterday = toIsoDate(new Date(Date.now() - 86_400_000));

  // Racha actual: días consecutivos terminando hoy o ayer (si todavía no
  // se estudió hoy, la racha no se corta hasta que termine el día).
  let currentStreak = 0;
  if (daySet.has(today) || daySet.has(yesterday)) {
    const cursor = new Date(daySet.has(today) ? today : yesterday);
    while (daySet.has(toIsoDate(cursor))) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  // Racha más larga histórica: mayor secuencia de días consecutivos en todo el historial.
  const sortedAsc = [...days].sort();
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < sortedAsc.length; i++) {
    const prev = new Date(sortedAsc[i - 1]!);
    const curr = new Date(sortedAsc[i]!);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    run = diffDays === 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
  }

  return { currentStreak, longestStreak, lastStudyDate: days[0] ?? null };
}

export interface ContinuityPointView {
  id: string;
  description: string;
  createdAt: string;
  topicTitle: string | null;
  subjectTitle: string | null;
  projectTitle: string | null;
}

export async function listContinuityPoints(limit = 20): Promise<ContinuityPointView[]> {
  const points = await continuityPointsRepo.list({ orderBy: "created_at DESC" });
  const limited = points.slice(0, limit);

  const views: ContinuityPointView[] = [];
  for (const point of limited) {
    const topic = point.topic_id ? await topicsRepo.getById(point.topic_id) : null;
    const subject = topic?.subject_id ? await subjectsRepo.getById(topic.subject_id) : null;
    const project = point.project_id ? await projectsRepo.getById(point.project_id) : null;
    views.push({
      id: point.id,
      description: point.description,
      createdAt: point.created_at,
      topicTitle: topic?.title ?? null,
      subjectTitle: subject?.title ?? null,
      projectTitle: project?.title ?? null,
    });
  }
  return views;
}
