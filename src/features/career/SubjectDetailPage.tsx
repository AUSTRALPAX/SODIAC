import { useCallback, useEffect, useState } from "react";
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
  BibliographicSourceRow,
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

const RELATION_TYPE_LABEL: Record<NonNullable<BibliographicSourceRow["relation_type"]>, string> = {
  bibliografia_principal: "Principal",
  bibliografia_obligatoria: "Obligatoria",
  bibliografia_complementaria: "Complementaria",
  referencia: "Referencia",
  profundizacion: "Profundización",
  aplicacion: "Aplicación",
  consulta_tecnica: "Consulta técnica",
  fuente_historica: "Fuente histórica",
  lectura_opcional: "Lectura opcional",
  prerequisito: "Prerequisito",
  utilizada_en_proyecto: "Utilizada en proyecto",
  citada: "Citada",
  descartada: "Descartada",
};
import { getSubjectXpBudgetTotal, getSubjectXpTotal } from "@/services/xp";
import {
  checkSubjectCompletionGate,
  completeSubject,
  completeTopic,
  previewSubjectCompletion,
  previewTopicCompletion,
  type SubjectCompletionGate,
} from "@/services/completionXp";

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
  bibliography: BibliographicSourceRow[];
  xpObtained: number;
  xpBudgetTotal: number;
}

export function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<SubjectCompletionGate | null>(null);

  const load = useCallback(async () => {
    if (!subjectId) return;
    const subject = await subjectsRepo.getById(subjectId);
    if (!subject) {
      setLoading(false);
      return;
    }
    const [stage, question, topics, units, projects, sessions, transcript, sources, xpObtained, xpBudget, subjectGate] =
      await Promise.all([
        subject.learning_stage_id ? learningStagesRepo.getById(subject.learning_stage_id) : Promise.resolve(null),
        fundamentalQuestionsRepo.getById(subject.fundamental_question_id),
        topicsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId], orderBy: "sort_order" }),
        curriculumUnitsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId], orderBy: "sort_order" }),
        projectsRepo.list({ where: "subject_id = ? AND archived_at IS NULL", params: [subjectId] }),
        studySessionsRepo.list({ where: "subject_id = ?", params: [subjectId], orderBy: "started_at DESC" }),
        academicTranscriptEntriesRepo.list({ where: "subject_id = ? AND status = 'vigente'", params: [subjectId], orderBy: "recorded_at DESC" }),
        bibliographicSourcesRepo.list({ where: "subject_id = ?", params: [subjectId] }),
        getSubjectXpTotal(subjectId),
        getSubjectXpBudgetTotal(subjectId),
        checkSubjectCompletionGate(subjectId),
      ]);

    const competencyIds = new Set(topics.map((t) => t.competency_id).filter((c): c is string => !!c));
    const competencies =
      competencyIds.size > 0 ? await competenciesRepo.list({ where: "archived_at IS NULL AND origin = 'curriculum'" }) : [];

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
      bibliography: sources,
      xpObtained: xpObtained,
      xpBudgetTotal: xpBudget.total,
    });
    setGate(subjectGate);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;
  if (!detail) return <div className="p-10 text-sm text-danger">La materia indicada no existe.</div>;

  const { subject, stage, question, competencies, units, topics, projects, sessions, transcript, resources, bibliography, xpObtained, xpBudgetTotal } = detail;
  const completedTopics = topics.filter((t) => t.completed_at).length;
  const progressPct = topics.length > 0 ? Math.round((completedTopics / topics.length) * 100) : 0;
  const xpTotal = xpBudgetTotal;
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
        {!subject.completed_at && (
          <div className="mt-3 border-t border-border-subtle pt-3">
            <SubjectCompleteControl subject={subject} gate={gate} onReload={load} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Unidades y temas</h2>
        <ul className="mt-2 space-y-2">
          {units.map((unit) => (
            <li key={unit.id} className="rounded border border-border-subtle bg-surface p-3">
              <p className="text-sm text-text-primary">{unit.title}</p>
              <ul className="mt-1 space-y-1 pl-3 text-xs text-text-secondary">
                {topics
                  .filter((t) => t.curriculum_unit_id === unit.id)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span>· {t.title}</span>
                      {t.completed_at ? <span className="text-success">✓</span> : <TopicCompleteInline topic={t} onReload={load} />}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
          {topics.filter((t) => !t.curriculum_unit_id).length > 0 && (
            <li className="rounded border border-border-subtle bg-surface p-3">
              <p className="text-sm text-text-primary">Sin unidad asignada</p>
              <ul className="mt-1 space-y-1 pl-3 text-xs text-text-secondary">
                {topics
                  .filter((t) => !t.curriculum_unit_id)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span>· {t.title}</span>
                      {t.completed_at ? <span className="text-success">✓</span> : <TopicCompleteInline topic={t} onReload={load} />}
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
            {resources.map((r) => {
              const link = bibliography.find((b) => b.resource_id === r.id);
              return (
                <li key={r.id}>
                  · {r.title}
                  {r.author ? ` — ${r.author}` : ""}
                  {link?.relation_type && (
                    <span className="ml-1.5 text-xs text-text-muted">({RELATION_TYPE_LABEL[link.relation_type]})</span>
                  )}
                </li>
              );
            })}
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

function TopicCompleteInline({ topic, onReload }: { topic: TopicRow; onReload: () => void }) {
  const [xpPreview, setXpPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleShowPreview() {
    setBusy(true);
    try {
      const preview = await previewTopicCompletion(topic);
      setXpPreview(preview.amount);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await completeTopic(topic.id);
      onReload();
    } finally {
      setBusy(false);
    }
  }

  if (xpPreview != null) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-accent">+{Math.round(xpPreview)} XP</span>
        <button onClick={() => void handleConfirm()} disabled={busy} className="text-accent underline disabled:opacity-40">
          Confirmar
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => void handleShowPreview()} disabled={busy} className="text-text-muted hover:text-accent disabled:opacity-40">
      Marcar completado
    </button>
  );
}

function SubjectCompleteControl({
  subject,
  gate,
  onReload,
}: {
  subject: SubjectRow;
  gate: SubjectCompletionGate | null;
  onReload: () => void;
}) {
  const [xpPreview, setXpPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleShowPreview() {
    setBusy(true);
    try {
      const preview = await previewSubjectCompletion(subject);
      setXpPreview(preview.amount);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await completeSubject(subject.id);
      onReload();
    } finally {
      setBusy(false);
    }
  }

  if (!gate?.eligible) {
    return (
      <p className="text-xs text-text-muted">
        Para cerrar la materia todavía faltan {gate?.pendingTopicCount ?? 0} tema(s) por completar.
      </p>
    );
  }

  if (xpPreview != null) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-accent">Cerrar materia: +{Math.round(xpPreview)} XP</span>
        <button
          onClick={() => void handleConfirm()}
          disabled={busy}
          className="rounded border border-accent bg-accent/10 px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
        >
          {busy ? "Cerrando…" : "Confirmar"}
        </button>
        <button onClick={() => setXpPreview(null)} className="text-xs text-text-muted hover:text-text-primary">
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => void handleShowPreview()}
      disabled={busy}
      className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
    >
      Cerrar materia
    </button>
  );
}
