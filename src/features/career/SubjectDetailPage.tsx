import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  academicTranscriptEntriesRepo,
  bibliographicSourcesRepo,
  competenciesRepo,
  curriculumUnitsRepo,
  fundamentalQuestionsRepo,
  learningStagesRepo,
  projectsRepo,
  resourcesRepo,
  studySessionsRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  AcademicTranscriptEntryRow,
  CompetencyRow,
  CurriculumUnitRow,
  FundamentalQuestionRow,
  LearningStageRow,
  ProjectRow,
  ResourceRow,
  StudySessionRow,
  SubjectRow,
  TopicRow,
} from "@/database/types";
import { getSubjectXpTotal } from "@/services/xp";

interface SubjectDetail {
  subject: SubjectRow;
  stage: LearningStageRow | null;
  question: FundamentalQuestionRow | null;
  competencies: CompetencyRow[];
  units: CurriculumUnitRow[];
  topics: TopicRow[];
  projects: ProjectRow[];
  sessions: StudySessionRow[];
  transcript: AcademicTranscriptEntryRow[];
  resources: ResourceRow[];
  xpObtained: number;
}

export function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subjectId) return;
    void (async () => {
      const subject = await subjectsRepo.getById(subjectId);
      if (!subject) {
        setLoading(false);
        return;
      }
      const [stage, question, topics, units, projects, sessions, transcript, sources, xpObtained] = await Promise.all([
        subject.learning_stage_id ? learningStagesRepo.getById(subject.learning_stage_id) : Promise.resolve(null),
        fundamentalQuestionsRepo.getById(subject.fundamental_question_id),
        topicsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId], orderBy: "sort_order" }),
        curriculumUnitsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId], orderBy: "sort_order" }),
        projectsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId] }),
        studySessionsRepo.list({ where: "subject_id = ?", params: [subjectId], orderBy: "started_at DESC" }),
        academicTranscriptEntriesRepo.list({ where: "subject_id = ? AND status = 'vigente'", params: [subjectId], orderBy: "recorded_at DESC" }),
        bibliographicSourcesRepo.list({ where: "subject_id = ?", params: [subjectId] }),
        getSubjectXpTotal(subjectId),
      ]);

      const competencyIds = new Set(topics.map((t) => t.competency_id).filter((c): c is string => !!c));
      const competencies = competencyIds.size > 0 ? await competenciesRepo.list({ where: "archived_at IS NULL" }) : [];

      const resourceIds = [...new Set(sources.map((s) => s.resource_id))];
      const resources = resourceIds.length > 0 ? await Promise.all(resourceIds.map((id) => resourcesRepo.getById(id))) : [];

      setDetail({
        subject,
        stage,
        question,
        competencies: competencies.filter((c) => competencyIds.has(c.id)),
        units,
        topics,
        projects,
        sessions,
        transcript,
        resources: resources.filter((r): r is ResourceRow => r != null),
        xpObtained: xpObtained,
      });
      setLoading(false);
    })();
  }, [subjectId]);

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;
  if (!detail) return <div className="p-10 text-sm text-danger">La materia indicada no existe.</div>;

  const { subject, stage, question, competencies, units, topics, projects, sessions, transcript, resources, xpObtained } = detail;
  const completedTopics = topics.filter((t) => t.completed_at).length;
  const progressPct = topics.length > 0 ? Math.round((completedTopics / topics.length) * 100) : 0;
  const xpTotal = (subject.budgeted_xp ?? 0) + (subject.completion_budgeted_xp ?? 0);
  const nextTopic = topics.find((t) => !t.completed_at);
  const average10 =
    transcript.length > 0 ? (transcript.reduce((sum, e) => sum + e.score_10, 0) / transcript.length).toFixed(1) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-10">
      <Link to="/carrera" className="text-sm text-text-secondary hover:text-accent">
        ← Carrera
      </Link>

      <div>
        <p className="text-xs uppercase tracking-wide text-text-muted">{stage?.title ?? "Sin etapa"}</p>
        <h1 className="mt-1 font-display text-2xl">{subject.title}</h1>
        {subject.description && <p className="mt-1 text-sm text-text-secondary">{subject.description}</p>}
        {question && <p className="mt-1 text-xs text-text-muted">Pregunta fundamental: {question.title}</p>}
        {competencies.length > 0 && (
          <p className="mt-1 text-xs text-text-muted">Competencias: {competencies.map((c) => c.title).join(", ")}</p>
        )}
      </div>

      <section className="rounded border border-border-subtle bg-surface p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Progreso</span>
          <span className="text-text-primary">
            {progressPct}% · {completedTopics}/{topics.length} temas
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-text-muted">XP obtenido</p>
            <p className="text-text-primary">
              {Math.round(xpObtained)}/{Math.round(xpTotal)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Créditos</p>
            <p className="text-text-primary">{subject.credits}</p>
          </div>
          {average10 && (
            <div>
              <p className="text-xs text-text-muted">Promedio</p>
              <p className="text-text-primary">{average10}/10</p>
            </div>
          )}
          <div>
            <p className="text-xs text-text-muted">Próxima acción</p>
            <p className="text-text-primary">{nextTopic ? nextTopic.title : subject.completed_at ? "Materia completada" : "—"}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Unidades y temas</h2>
        <ul className="mt-2 space-y-2">
          {units.map((unit) => (
            <li key={unit.id} className="rounded border border-border-subtle bg-surface p-3">
              <p className="text-sm text-text-primary">{unit.title}</p>
              <ul className="mt-1 space-y-0.5 pl-3 text-xs text-text-secondary">
                {topics
                  .filter((t) => t.curriculum_unit_id === unit.id)
                  .map((t) => (
                    <li key={t.id}>
                      · {t.title} {t.completed_at ? "✓" : ""}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
          {topics.filter((t) => !t.curriculum_unit_id).length > 0 && (
            <li className="rounded border border-border-subtle bg-surface p-3">
              <p className="text-sm text-text-primary">Sin unidad asignada</p>
              <ul className="mt-1 space-y-0.5 pl-3 text-xs text-text-secondary">
                {topics
                  .filter((t) => !t.curriculum_unit_id)
                  .map((t) => (
                    <li key={t.id}>
                      · {t.title} {t.completed_at ? "✓" : ""}
                    </li>
                  ))}
              </ul>
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Bibliografía</h2>
        {resources.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">Sin bibliografía vinculada todavía.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-text-secondary">
            {resources.map((r) => (
              <li key={r.id}>· {r.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Proyectos</h2>
        {projects.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">Sin proyectos vinculados todavía.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-text-secondary">
            {projects.map((p) => (
              <li key={p.id}>· {p.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Sesiones recientes</h2>
        {sessions.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">Sin sesiones registradas todavía.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-text-secondary">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id}>
                · {s.observable_objective} — {s.started_at ? new Date(s.started_at).toLocaleDateString("es-AR") : "—"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Calificaciones</h2>
        {transcript.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">Sin evaluaciones registradas todavía.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-text-secondary">
            {transcript.map((e) => (
              <li key={e.id}>
                · {e.title} — {e.score_100}/100 ({e.score_10.toFixed(1)}/10)
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
