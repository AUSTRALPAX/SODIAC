import { getDb } from "@/database/client";
import {
  backupRecordsRepo,
  fundamentalQuestionsRepo,
  institutionalDocumentsRepo,
  learningStagesRepo,
  obsidianNotesRepo,
  projectMilestonesRepo,
  projectsRepo,
  resourcesRepo,
  reviewsRepo,
  studySessionsRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import { getLatestMasteryByCompetency } from "@/services/mastery";
import { getSetting, setSetting } from "@/services/settings";

const DAY_MS = 86_400_000;

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // lunes = 0
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function startOfMonth(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ---------------------------------------------------------------------------
// Cabecera: estado general de la carrera
// ---------------------------------------------------------------------------

export interface CareerOverview {
  instituteName: string;
  currentStageTitle: string | null;
  coverage: number;
  avgMasteryLevel: number | null;
  totalTopics: number;
  evaluatedTopics: number;
}

export async function getCareerOverview(): Promise<CareerOverview> {
  const [topics, masteryByCompetency, stages] = await Promise.all([
    topicsRepo.list({ where: "archived_at IS NULL" }),
    getLatestMasteryByCompetency(),
    learningStagesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order ASC" }),
  ]);

  const evaluated = topics.filter((t) => t.competency_id && masteryByCompetency.has(t.competency_id));
  const levels = evaluated
    .map((t) => masteryByCompetency.get(t.competency_id!)?.level)
    .filter((l): l is number => l !== undefined);
  const avgMasteryLevel = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : null;

  // Etapa actual = la primera etapa con temas todavía no evaluados; si todas están
  // cubiertas, la última etapa (docs/DATA_MODEL.md §3 — el progreso se acredita por
  // evaluación, nunca se asume una etapa "actual" arbitraria).
  let currentStage = stages[0] ?? null;
  for (const stage of stages) {
    const stageTopics = topics.filter((t) => t.learning_stage_id === stage.id);
    const stageEvaluated = stageTopics.filter((t) => t.competency_id && masteryByCompetency.has(t.competency_id));
    if (stageTopics.length > 0 && stageEvaluated.length < stageTopics.length) {
      currentStage = stage;
      break;
    }
    if (stageTopics.length > 0) currentStage = stage;
  }

  return {
    instituteName: "Instituto de Asignación de Capital, Creación de Valor y Pensamiento Sistémico",
    currentStageTitle: currentStage?.title ?? null,
    coverage: topics.length > 0 ? evaluated.length / topics.length : 0,
    avgMasteryLevel,
    totalTopics: topics.length,
    evaluatedTopics: evaluated.length,
  };
}

// ---------------------------------------------------------------------------
// Tarjetas de resumen
// ---------------------------------------------------------------------------

export interface SummaryCounts {
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  activeDaysThisWeek: number;
  activeDaysThisMonth: number;
  studyMinutesThisWeek: number;
  evidencesProduced: number;
  reviewsCompleted: number;
  reviewsPending: number;
  activeProjects: number;
  obsidianNotesIndexed: number;
  activeLibraryResources: number;
  activeSubjects: number;
}

export async function getSummaryCounts(): Promise<SummaryCounts> {
  const db = await getDb();
  const now = new Date();
  const weekStart = startOfWeek(now).toISOString();
  const monthStart = startOfMonth(now).toISOString();

  const [weekRows, monthRows, evidenceRows, reviewRows, projects, notes, resources, subjects] = await Promise.all([
    db.select<Array<{ day: string; minutes: number | null }>>(
      `SELECT date(started_at) as day, SUM(actual_duration_min) as minutes FROM study_session
       WHERE started_at IS NOT NULL AND started_at >= ? AND closure_status != 'cancelada'
       GROUP BY day`,
      [weekStart],
    ),
    db.select<Array<{ day: string }>>(
      `SELECT date(started_at) as day FROM study_session
       WHERE started_at IS NOT NULL AND started_at >= ? AND closure_status != 'cancelada'
       GROUP BY day`,
      [monthStart],
    ),
    db.select<Array<{ count: number }>>(`SELECT COUNT(*) as count FROM learning_evidence WHERE archived_at IS NULL`),
    db.select<Array<{ state: string; count: number }>>(
      `SELECT state, COUNT(*) as count FROM review WHERE archived_at IS NULL GROUP BY state`,
    ),
    projectsRepo.list({ where: "archived_at IS NULL AND closed_at IS NULL" }),
    obsidianNotesRepo.list(),
    resourcesRepo.list({ where: "archived_at IS NULL" }),
    subjectsRepo.list({ where: "archived_at IS NULL" }),
  ]);

  const reviewsByState = new Map(reviewRows.map((r) => [r.state, r.count]));
  const overdueAndPending = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM review WHERE archived_at IS NULL AND state IN ('no_programado','proximo','pendiente')`,
  );

  return {
    sessionsThisWeek: weekRows.length,
    sessionsThisMonth: monthRows.length,
    activeDaysThisWeek: weekRows.length,
    activeDaysThisMonth: monthRows.length,
    studyMinutesThisWeek: weekRows.reduce((sum, r) => sum + (r.minutes ?? 0), 0),
    evidencesProduced: evidenceRows[0]?.count ?? 0,
    reviewsCompleted: reviewsByState.get("completado") ?? 0,
    reviewsPending: overdueAndPending[0]?.count ?? 0,
    activeProjects: projects.length,
    obsidianNotesIndexed: notes.length,
    activeLibraryResources: resources.length,
    activeSubjects: subjects.length,
  };
}

// ---------------------------------------------------------------------------
// Heatmap de actividad
// ---------------------------------------------------------------------------

export interface ActivityDay {
  day: string;
  estudio: number;
  aplicacion: number;
  produccion: number;
  repaso: number;
  proyecto: number;
  minutes: number;
}

const CATEGORY_BY_SESSION_TYPE: Record<string, keyof Omit<ActivityDay, "day" | "minutes" | "proyecto">> = {
  explicacion: "estudio",
  debate: "estudio",
  lectura: "estudio",
  diagnostico: "estudio",
  ejercicio: "aplicacion",
  laboratorio: "aplicacion",
  aplicacion: "aplicacion",
  produccion_escrita: "produccion",
  revision: "repaso",
};

export async function getActivityHeatmap(days: 30 | 90 | 365): Promise<ActivityDay[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ day: string; session_type: string; count: number; minutes: number | null }>>(
    `SELECT date(started_at) as day, session_type, COUNT(*) as count, SUM(actual_duration_min) as minutes
     FROM study_session
     WHERE started_at IS NOT NULL AND date(started_at) >= date('now', ?) AND closure_status != 'cancelada'
     GROUP BY day, session_type`,
    [`-${days} days`],
  );
  const projectDays = await db.select<Array<{ day: string; count: number }>>(
    `SELECT date(le.created_at) as day, COUNT(*) as count
     FROM learning_evidence le
     WHERE le.project_id IS NOT NULL AND date(le.created_at) >= date('now', ?)
     GROUP BY day`,
    [`-${days} days`],
  );

  const byDay = new Map<string, ActivityDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { day: key, estudio: 0, aplicacion: 0, produccion: 0, repaso: 0, proyecto: 0, minutes: 0 });
  }
  for (const row of rows) {
    const entry = byDay.get(row.day);
    if (!entry) continue;
    const category = CATEGORY_BY_SESSION_TYPE[row.session_type];
    if (category) entry[category] += row.count;
    entry.minutes += row.minutes ?? 0;
  }
  for (const row of projectDays) {
    const entry = byDay.get(row.day);
    if (entry) entry.proyecto += row.count;
  }
  return Array.from(byDay.values());
}

// ---------------------------------------------------------------------------
// Progreso académico
// ---------------------------------------------------------------------------

export interface ProgressBucket {
  id: string;
  title: string;
  totalTopics: number;
  evaluatedTopics: number;
  coverage: number;
  avgLevel: number | null;
}

export interface AcademicProgress {
  byStage: ProgressBucket[];
  byQuestion: ProgressBucket[];
  bySubject: ProgressBucket[];
  masteryDistribution: Record<number, number>;
  topicsWithoutEvidence: number;
  topicsCooled: number;
  topicsPendingReview: number;
}

async function buildBuckets(
  groups: { id: string; title: string }[],
  topics: Awaited<ReturnType<typeof topicsRepo.list>>,
  keyOf: (t: (typeof topics)[number]) => string | null,
  masteryByCompetency: Map<string, { level: number }>,
): Promise<ProgressBucket[]> {
  return groups
    .map((group) => {
      const groupTopics = topics.filter((t) => keyOf(t) === group.id);
      const evaluated = groupTopics.filter((t) => t.competency_id && masteryByCompetency.has(t.competency_id));
      const levels = evaluated.map((t) => masteryByCompetency.get(t.competency_id!)!.level);
      return {
        id: group.id,
        title: group.title,
        totalTopics: groupTopics.length,
        evaluatedTopics: evaluated.length,
        coverage: groupTopics.length > 0 ? evaluated.length / groupTopics.length : 0,
        avgLevel: levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : null,
      };
    })
    .filter((b) => b.totalTopics > 0);
}

export async function getAcademicProgress(): Promise<AcademicProgress> {
  const [topics, stages, questions, subjects, masteryByCompetency, reviews] = await Promise.all([
    topicsRepo.list({ where: "archived_at IS NULL" }),
    learningStagesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order ASC" }),
    fundamentalQuestionsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order ASC" }),
    subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order ASC" }),
    getLatestMasteryByCompetency(),
    reviewsRepo.list({ where: "archived_at IS NULL" }),
  ]);

  const subjectFundamentalQuestionId = new Map(subjects.map((s) => [s.id, s.fundamental_question_id]));

  const byStage = await buildBuckets(
    stages.map((s) => ({ id: s.id, title: s.title })),
    topics,
    (t) => t.learning_stage_id,
    masteryByCompetency,
  );
  const byQuestion = await buildBuckets(
    questions.map((q) => ({ id: q.id, title: q.title })),
    topics,
    (t) => {
      const subject = subjects.find((s) => s.id === t.subject_id);
      return subject ? subjectFundamentalQuestionId.get(subject.id) ?? null : null;
    },
    masteryByCompetency,
  );
  const bySubject = await buildBuckets(
    subjects.map((s) => ({ id: s.id, title: s.title })),
    topics,
    (t) => t.subject_id,
    masteryByCompetency,
  );

  const masteryDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const assessment of masteryByCompetency.values()) {
    masteryDistribution[assessment.level] = (masteryDistribution[assessment.level] ?? 0) + 1;
  }

  const topicsWithoutEvidence = topics.filter(
    (t) => !t.competency_id || !masteryByCompetency.has(t.competency_id),
  ).length;
  const topicsCooled = reviews.filter((r) => r.state === "enfriado" && r.topic_id).length;
  const topicsPendingReview = reviews.filter(
    (r) => ["no_programado", "proximo", "pendiente"].includes(r.state) && r.topic_id,
  ).length;

  return { byStage, byQuestion, bySubject, masteryDistribution, topicsWithoutEvidence, topicsCooled, topicsPendingReview };
}

// ---------------------------------------------------------------------------
// Confianza declarada vs. nivel evaluado
// ---------------------------------------------------------------------------

export interface ConfidenceVsLevelPoint {
  assessedAt: string;
  level: number;
  declaredConfidence: number | null;
  perceivedDifficulty: number | null;
}

export async function getConfidenceVsLevel(limit = 30): Promise<ConfidenceVsLevelPoint[]> {
  const db = await getDb();
  const rows = await db.select<
    Array<{ assessed_at: string; level: number; declared_confidence: number | null; perceived_difficulty: number | null }>
  >(
    `SELECT assessed_at, level, declared_confidence, perceived_difficulty
     FROM mastery_assessment ORDER BY assessed_at DESC LIMIT ?`,
    [limit],
  );
  return rows
    .map((r) => ({
      assessedAt: r.assessed_at,
      level: r.level,
      declaredConfidence: r.declared_confidence,
      perceivedDifficulty: r.perceived_difficulty,
    }))
    .reverse();
}

// ---------------------------------------------------------------------------
// Estado del sistema
// ---------------------------------------------------------------------------

export interface SystemStatus {
  lastClosedSessionAt: string | null;
  lastNoteCreatedAt: string | null;
  lastObsidianSyncAt: string | null;
  lastBackupAt: string | null;
  documentsCount: number;
  libraryResourcesCount: number;
  alerts: string[];
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const db = await getDb();
  const [lastSession, lastNote, lastBackup, documents, resources, vaultPath] = await Promise.all([
    db.select<Array<{ ended_at: string }>>(
      `SELECT ended_at FROM study_session WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`,
    ),
    db.select<Array<{ indexed_at: string }>>(`SELECT indexed_at FROM obsidian_note ORDER BY indexed_at DESC LIMIT 1`),
    backupRecordsRepo.list({ orderBy: "created_at DESC" }),
    institutionalDocumentsRepo.list({ where: "archived_at IS NULL" }),
    resourcesRepo.list({ where: "archived_at IS NULL" }),
    getSetting<string>("vault_path"),
  ]);

  const alerts: string[] = [];
  if (!vaultPath) alerts.push("No hay un vault de Obsidian configurado todavía.");
  const lastBackupAt = lastBackup[0]?.created_at ?? null;
  if (!lastBackupAt) {
    alerts.push("Todavía no se generó ningún backup.");
  } else if (Date.now() - new Date(lastBackupAt).getTime() > 7 * DAY_MS) {
    alerts.push("El último backup tiene más de 7 días.");
  }

  return {
    lastClosedSessionAt: lastSession[0]?.ended_at ?? null,
    lastNoteCreatedAt: lastNote[0]?.indexed_at ?? null,
    lastObsidianSyncAt: lastNote[0]?.indexed_at ?? null,
    lastBackupAt,
    documentsCount: documents.length,
    libraryResourcesCount: resources.length,
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Agenda general (próximos 7 días, sin acción de inicio de sesión)
// ---------------------------------------------------------------------------

export interface AgendaItem {
  id: string;
  date: string;
  kind: "repaso" | "hito" | "sesion" | "proyecto";
  label: string;
}

export async function getUpcomingAgenda(): Promise<AgendaItem[]> {
  const in7Days = new Date(Date.now() + 7 * DAY_MS).toISOString();
  const now = new Date().toISOString();

  const [reviews, milestones, sessions] = await Promise.all([
    reviewsRepo.list({ where: "archived_at IS NULL AND due_at IS NOT NULL AND due_at BETWEEN ? AND ?", params: [now, in7Days] }),
    projectMilestonesRepo.list({ where: "due_at IS NOT NULL AND due_at BETWEEN ? AND ? AND status != 'completado'", params: [now, in7Days] }),
    studySessionsRepo.list({ where: "started_at IS NOT NULL AND started_at BETWEEN ? AND ? AND closure_status = 'en_curso'", params: [now, in7Days] }),
  ]);

  const items: AgendaItem[] = [
    ...reviews.map((r) => ({ id: r.id, date: r.due_at!, kind: "repaso" as const, label: "Repaso programado" })),
    ...milestones.map((m) => ({ id: m.id, date: m.due_at!, kind: "hito" as const, label: m.title })),
    ...sessions.map((s) => ({ id: s.id, date: s.started_at!, kind: "sesion" as const, label: "Sesión programada" })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Personalización de widgets
// ---------------------------------------------------------------------------

export const DASHBOARD_WIDGET_IDS = [
  "resumen",
  "heatmap",
  "progreso",
  "temporal",
  "sistema",
  "agenda",
] as const;
export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export interface DashboardPrefs {
  order: DashboardWidgetId[];
  hidden: DashboardWidgetId[];
  rangeDays: 30 | 90 | 365;
}

const DEFAULT_PREFS: DashboardPrefs = {
  order: [...DASHBOARD_WIDGET_IDS],
  hidden: [],
  rangeDays: 30,
};

const PREFS_KEY = "dashboard_prefs";

export async function getDashboardPrefs(): Promise<DashboardPrefs> {
  const stored = await getSetting<DashboardPrefs>(PREFS_KEY);
  if (!stored) return DEFAULT_PREFS;
  return {
    order: stored.order?.length ? stored.order : DEFAULT_PREFS.order,
    hidden: stored.hidden ?? [],
    rangeDays: stored.rangeDays ?? 30,
  };
}

export async function setDashboardPrefs(prefs: DashboardPrefs): Promise<void> {
  await setSetting(PREFS_KEY, prefs);
}

export async function resetDashboardPrefs(): Promise<void> {
  await setSetting(PREFS_KEY, DEFAULT_PREFS);
}
