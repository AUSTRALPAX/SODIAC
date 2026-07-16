import { getDb } from "@/database/client";
import {
  careerProgressSnapshotsRepo,
  progressFormulaVersionsRepo,
  projectsRepo,
  reviewsRepo,
  subjectProgressSnapshotsRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import { getLatestMasteryByCompetency } from "@/services/mastery";
import type { ProgressFormulaVersionRow, TopicRow } from "@/database/types";

const now = () => new Date().toISOString();

export interface IpaWeights {
  coverage: number;
  mastery: number;
  evidence: number;
  retention: number;
  projects: number;
}

/**
 * Ponderación predeterminada del IPA (prompt maestro §11). El tiempo estudiado
 * queda deliberadamente afuera — es una estadística, no un componente del progreso.
 */
export const DEFAULT_IPA_WEIGHTS: IpaWeights = {
  coverage: 0.15,
  mastery: 0.35,
  evidence: 0.25,
  retention: 0.15,
  projects: 0.10,
};

export async function ensureCurrentFormulaVersion(): Promise<ProgressFormulaVersionRow> {
  const existing = await progressFormulaVersionsRepo.list({ where: "is_current = 1" });
  if (existing[0]) return existing[0];
  const version: ProgressFormulaVersionRow = {
    id: crypto.randomUUID(),
    version_label: "v1.0",
    weights_json: JSON.stringify(DEFAULT_IPA_WEIGHTS),
    is_current: 1,
    created_at: now(),
    updated_at: now(),
  };
  await progressFormulaVersionsRepo.insert(version);
  return version;
}

/**
 * Cambiar la ponderación crea una nueva versión — nunca se sobrescribe la
 * anterior, así los cálculos históricos (career_progress_snapshot /
 * subject_progress_snapshot) siguen siendo interpretables con la fórmula que
 * los produjo (prompt maestro §11).
 */
export async function updateIpaWeights(weights: IpaWeights, label: string): Promise<ProgressFormulaVersionRow> {
  const sum = weights.coverage + weights.mastery + weights.evidence + weights.retention + weights.projects;
  if (Math.abs(sum - 1) > 0.001) throw new Error("Los pesos del IPA deben sumar exactamente 1 (100%).");

  const current = await progressFormulaVersionsRepo.list({ where: "is_current = 1" });
  for (const v of current) {
    await progressFormulaVersionsRepo.update(v.id, { is_current: 0 });
  }
  const version: ProgressFormulaVersionRow = {
    id: crypto.randomUUID(),
    version_label: label,
    weights_json: JSON.stringify(weights),
    is_current: 1,
    created_at: now(),
    updated_at: now(),
  };
  await progressFormulaVersionsRepo.insert(version);
  return version;
}

export interface IpaComponents {
  coverage: number;
  mastery: number;
  evidence: number;
  retention: number;
  projects: number;
}

export interface IpaResult {
  total: number;
  components: IpaComponents;
  weights: IpaWeights;
  formulaVersionLabel: string;
}

export type IpaScope =
  | { kind: "career" }
  | { kind: "stage"; stageId: string }
  | { kind: "question"; questionId: string }
  | { kind: "competency"; competencyId: string }
  | { kind: "subject"; subjectId: string };

async function resolveScopeTopics(scope: IpaScope): Promise<TopicRow[]> {
  const allTopics = await topicsRepo.list({ where: "archived_at IS NULL" });
  if (scope.kind === "career") return allTopics;
  if (scope.kind === "stage") return allTopics.filter((t) => t.learning_stage_id === scope.stageId);
  if (scope.kind === "competency") return allTopics.filter((t) => t.competency_id === scope.competencyId);
  if (scope.kind === "subject") return allTopics.filter((t) => t.subject_id === scope.subjectId);

  // question: vía subject.fundamental_question_id
  const subjects = await subjectsRepo.list({ where: "fundamental_question_id = ?", params: [scope.questionId] });
  const subjectIds = new Set(subjects.map((s) => s.id));
  return allTopics.filter((t) => subjectIds.has(t.subject_id));
}

async function computeCoverageAndMastery(topics: TopicRow[]): Promise<{ coverage: number; mastery: number }> {
  const masteryByCompetency = await getLatestMasteryByCompetency();
  const evaluated = topics.filter((t) => t.competency_id && masteryByCompetency.has(t.competency_id));
  const coverage = topics.length > 0 ? evaluated.length / topics.length : 0;
  const levels = evaluated.map((t) => masteryByCompetency.get(t.competency_id!)!.level);
  const avgLevel = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  return { coverage, mastery: avgLevel / 5 };
}

/**
 * Evidencia = proporción de temas evaluados cuya evaluación de dominio tiene
 * una evidencia asociada (evidence_id no nulo) — evita confundir "hay una nota"
 * con "hay evidencia válida de aplicación" (prompt maestro §2).
 */
async function computeEvidence(topics: TopicRow[]): Promise<number> {
  if (topics.length === 0) return 0;
  const db = await getDb();
  const competencyIds = Array.from(new Set(topics.map((t) => t.competency_id).filter((id): id is string => !!id)));
  if (competencyIds.length === 0) return 0;
  const placeholders = competencyIds.map(() => "?").join(",");
  const rows = await db.select<Array<{ competency_id: string; evidence_id: string | null }>>(
    `SELECT competency_id, evidence_id FROM mastery_assessment
     WHERE competency_id IN (${placeholders})
     ORDER BY assessed_at DESC`,
    competencyIds,
  );
  const latestByCompetency = new Map<string, string | null>();
  for (const row of rows) {
    if (!latestByCompetency.has(row.competency_id)) latestByCompetency.set(row.competency_id, row.evidence_id);
  }
  const withEvidence = topics.filter((t) => t.competency_id && !!latestByCompetency.get(t.competency_id)).length;
  return withEvidence / topics.length;
}

/** Retención = repasos completados / (completados + vencidos) sobre el alcance dado. */
async function computeRetention(topics: TopicRow[], scope: IpaScope): Promise<number> {
  const topicIds = new Set(topics.map((t) => t.id));
  const allReviews = await reviewsRepo.list({ where: "archived_at IS NULL" });
  const scoped = scope.kind === "career" ? allReviews : allReviews.filter((r) => r.topic_id && topicIds.has(r.topic_id));
  if (scoped.length === 0) return 0;
  const completed = scoped.filter((r) => r.state === "completado").length;
  const overdue = scoped.filter(
    (r) => r.due_at && new Date(r.due_at) < new Date() && !["completado", "innecesario", "enfriado"].includes(r.state),
  ).length;
  const denom = completed + overdue;
  return denom > 0 ? completed / denom : 0;
}

/**
 * Proyectos = proporción de proyectos cerrados sobre el total activo+cerrado.
 * Se calcula a nivel de carrera (el modelo actual no liga un proyecto a un
 * subconjunto de temas de forma unívoca) y se reutiliza igual para todos los
 * alcances — una simplificación documentada, no una limitación oculta.
 */
async function computeProjects(): Promise<number> {
  const projects = await projectsRepo.list({ where: "archived_at IS NULL" });
  if (projects.length === 0) return 0;
  const closed = projects.filter((p) => p.closed_at).length;
  return closed / projects.length;
}

export async function computeIpa(scope: IpaScope): Promise<IpaResult> {
  const formulaVersion = await ensureCurrentFormulaVersion();
  const weights = JSON.parse(formulaVersion.weights_json) as IpaWeights;

  const topics = await resolveScopeTopics(scope);
  const { coverage, mastery } = await computeCoverageAndMastery(topics);
  const evidence = await computeEvidence(topics);
  const retention = await computeRetention(topics, scope);
  const projects = await computeProjects();

  const total =
    coverage * weights.coverage +
    mastery * weights.mastery +
    evidence * weights.evidence +
    retention * weights.retention +
    projects * weights.projects;

  return {
    total,
    components: { coverage, mastery, evidence, retention, projects },
    weights,
    formulaVersionLabel: formulaVersion.version_label,
  };
}

export async function recordCareerSnapshot(): Promise<void> {
  const formulaVersion = await ensureCurrentFormulaVersion();
  const result = await computeIpa({ kind: "career" });
  await careerProgressSnapshotsRepo.insert({
    id: crypto.randomUUID(),
    formula_version_id: formulaVersion.id,
    ipa_total: result.total,
    coverage: result.components.coverage,
    mastery: result.components.mastery,
    evidence: result.components.evidence,
    retention: result.components.retention,
    projects: result.components.projects,
    computed_at: now(),
  });
}

export async function recordSubjectSnapshot(subjectId: string): Promise<void> {
  const formulaVersion = await ensureCurrentFormulaVersion();
  const result = await computeIpa({ kind: "subject", subjectId });
  await subjectProgressSnapshotsRepo.insert({
    id: crypto.randomUUID(),
    subject_id: subjectId,
    formula_version_id: formulaVersion.id,
    ipa_total: result.total,
    coverage: result.components.coverage,
    mastery: result.components.mastery,
    evidence: result.components.evidence,
    retention: result.components.retention,
    projects: result.components.projects,
    computed_at: now(),
  });
}

export async function listCareerSnapshots() {
  return careerProgressSnapshotsRepo.list({ orderBy: "computed_at DESC" });
}
