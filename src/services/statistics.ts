import { getDb } from "@/database/client";
import { subjectsRepo, topicsRepo } from "@/database/entities";
import { getLatestMasteryByCompetency } from "@/services/mastery";

export interface XpEvolutionPoint {
  day: string;
  amount: number;
  cumulative: number;
}

/** XP ganado por día en los últimos `days` — para ver el ritmo real, no solo el total acumulado. */
export async function getXpEvolution(days = 30): Promise<XpEvolutionPoint[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ day: string; amount: number }>>(
    `SELECT date(date) as day, SUM(amount) as amount
     FROM xp_event
     WHERE date(date) >= date('now', ?)
     GROUP BY day
     ORDER BY day ASC`,
    [`-${days} days`],
  );
  const priorTotal = await db.select<Array<{ total: number }>>(
    `SELECT COALESCE(SUM(amount),0) as total FROM xp_event WHERE date(date) < date('now', ?)`,
    [`-${days} days`],
  );

  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) byDay.set(row.day, row.amount);

  let cumulative = priorTotal[0]?.total ?? 0;
  return [...byDay.entries()].map(([day, amount]) => {
    cumulative += amount;
    return { day, amount: Math.round(amount), cumulative: Math.round(cumulative) };
  });
}

export interface SubjectCompletionRate {
  subjectTitle: string;
  totalTopics: number;
  completedTopics: number;
  completionPct: number;
}

/** % de temas completados por materia — el mismo `completed_at` que usa Carrera, no un dato aparte. */
export async function getSubjectCompletionRates(): Promise<SubjectCompletionRate[]> {
  const [subjects, topics] = await Promise.all([
    subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
    topicsRepo.list({ where: "archived_at IS NULL" }),
  ]);
  return subjects
    .map((subject) => {
      const subjectTopics = topics.filter((t) => t.subject_id === subject.id);
      const completed = subjectTopics.filter((t) => t.completed_at).length;
      return {
        subjectTitle: subject.title,
        totalTopics: subjectTopics.length,
        completedTopics: completed,
        completionPct: subjectTopics.length > 0 ? Math.round((completed / subjectTopics.length) * 100) : 0,
      };
    })
    .filter((r) => r.totalTopics > 0);
}

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

export interface BibliographyStats {
  totalResources: number;
  resourcesWithLocalFile: number;
  resourcesWithRelations: number;
  resourcesWithoutRelations: number;
  usedInSessions: number;
  usedInProjects: number;
  citedCount: number;
  topAuthors: { author: string; count: number }[];
}

/** Estadísticas de Biblioteca (sección 19 del pedido) — mismos eventos ya registrados, no cuenta renders. */
export async function getBibliographyStats(): Promise<BibliographyStats> {
  const db = await getDb();
  const [totals, withRelations, usage, authors] = await Promise.all([
    db.select<Array<{ total: number; withFile: number }>>(
      `SELECT COUNT(*) as total, SUM(CASE WHEN file_path IS NOT NULL THEN 1 ELSE 0 END) as withFile
       FROM resource WHERE archived_at IS NULL`,
    ),
    db.select<Array<{ resourceId: string }>>(
      `SELECT DISTINCT resource_id as resourceId FROM bibliographic_source
       WHERE subject_id IS NOT NULL OR curriculum_unit_id IS NOT NULL OR topic_id IS NOT NULL OR project_id IS NOT NULL`,
    ),
    db.select<Array<{ action: string; count: number }>>(
      `SELECT action, COUNT(DISTINCT resource_id) as count FROM resource_usage_event GROUP BY action`,
    ),
    db.select<Array<{ author: string; count: number }>>(
      `SELECT author, COUNT(*) as count FROM resource WHERE archived_at IS NULL AND author IS NOT NULL
       GROUP BY author ORDER BY count DESC LIMIT 5`,
    ),
  ]);

  const total = totals[0]?.total ?? 0;
  const withRelationsCount = withRelations.length;
  const usageByAction = new Map(usage.map((u) => [u.action, u.count]));

  return {
    totalResources: total,
    resourcesWithLocalFile: totals[0]?.withFile ?? 0,
    resourcesWithRelations: withRelationsCount,
    resourcesWithoutRelations: total - withRelationsCount,
    usedInSessions: usageByAction.get("utilizado_en_sesion") ?? 0,
    usedInProjects: usageByAction.get("utilizado_en_proyecto") ?? 0,
    citedCount: usageByAction.get("citado") ?? 0,
    topAuthors: authors,
  };
}
