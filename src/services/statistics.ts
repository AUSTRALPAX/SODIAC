import { getDb } from "@/database/client";
import { subjectsRepo, topicsRepo } from "@/database/entities";
import { getLatestMasteryByCompetency } from "@/services/mastery";

export interface SessionActivityDay {
  day: string;
  formal: number;
  cancelada: number;
  incompleta: number;
  en_curso: number;
}

export async function getSessionActivity(days = 14): Promise<SessionActivityDay[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ day: string; closure_status: string; count: number }>>(
    `SELECT date(started_at) as day, closure_status, COUNT(*) as count
     FROM study_session
     WHERE started_at IS NOT NULL AND date(started_at) >= date('now', ?)
     GROUP BY day, closure_status`,
    [`-${days} days`],
  );

  const byDay = new Map<string, SessionActivityDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { day: key, formal: 0, cancelada: 0, incompleta: 0, en_curso: 0 });
  }
  for (const row of rows) {
    const entry = byDay.get(row.day);
    if (entry && row.closure_status in entry) {
      (entry as unknown as Record<string, number>)[row.closure_status] = row.count;
    }
  }
  return Array.from(byDay.values());
}

export interface MasteryEvolutionPoint {
  day: string;
  avgLevel: number;
}

export async function getMasteryEvolution(): Promise<MasteryEvolutionPoint[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ day: string; avg_level: number }>>(
    `SELECT date(assessed_at) as day, AVG(level) as avg_level
     FROM mastery_assessment
     GROUP BY day
     ORDER BY day ASC`,
  );
  return rows.map((r) => ({ day: r.day, avgLevel: Math.round(r.avg_level * 10) / 10 }));
}

export interface ReviewStats {
  vencidos: number;
  proximos: number;
  completados: number;
  pospuestos: number;
  innecesarios: number;
  enfriados: number;
}

export async function getReviewStats(): Promise<ReviewStats> {
  const db = await getDb();
  const rows = await db.select<Array<{ state: string; count: number }>>(
    `SELECT state, COUNT(*) as count FROM review WHERE archived_at IS NULL GROUP BY state`,
  );
  const overdue = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM review WHERE archived_at IS NULL AND due_at IS NOT NULL AND due_at < datetime('now') AND state IN ('proximo','pendiente','no_programado')`,
  );
  const byState = new Map(rows.map((r) => [r.state, r.count]));
  return {
    vencidos: overdue[0]?.count ?? 0,
    proximos: (byState.get("proximo") ?? 0) + (byState.get("pendiente") ?? 0),
    completados: byState.get("completado") ?? 0,
    pospuestos: byState.get("pospuesto") ?? 0,
    innecesarios: byState.get("innecesario") ?? 0,
    enfriados: byState.get("enfriado") ?? 0,
  };
}

export interface BlockDistribution {
  comprension: number;
  aplicacion: number;
  consolidacion: number;
}

export async function getBlockDistribution(): Promise<BlockDistribution> {
  const db = await getDb();
  const rows = await db.select<Array<{ block_type: string; count: number }>>(
    `SELECT block_type, COUNT(*) as count FROM study_block GROUP BY block_type`,
  );
  const byType = new Map(rows.map((r) => [r.block_type, r.count]));
  return {
    comprension: byType.get("comprension") ?? 0,
    aplicacion: byType.get("aplicacion") ?? 0,
    consolidacion: byType.get("consolidacion") ?? 0,
  };
}

export interface SubjectBottleneck {
  subjectTitle: string;
  totalTopics: number;
  evaluatedTopics: number;
  coverage: number;
}

/** Materias con menor proporción de temas evaluados — señal de cuello de botella. */
export async function getBottlenecks(limit = 5): Promise<SubjectBottleneck[]> {
  const [subjects, topics, masteryByCompetency] = await Promise.all([
    subjectsRepo.list({ where: "archived_at IS NULL" }),
    topicsRepo.list({ where: "archived_at IS NULL" }),
    getLatestMasteryByCompetency(),
  ]);

  const result: SubjectBottleneck[] = subjects
    .map((subject) => {
      const subjectTopics = topics.filter((t) => t.subject_id === subject.id);
      const evaluated = subjectTopics.filter((t) => t.competency_id && masteryByCompetency.has(t.competency_id));
      return {
        subjectTitle: subject.title,
        totalTopics: subjectTopics.length,
        evaluatedTopics: evaluated.length,
        coverage: subjectTopics.length > 0 ? evaluated.length / subjectTopics.length : 0,
      };
    })
    .filter((r) => r.totalTopics > 0)
    .sort((a, b) => a.coverage - b.coverage);

  return result.slice(0, limit);
}
