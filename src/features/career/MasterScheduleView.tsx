import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useViewPreference } from "@/hooks/useViewPreference";
import {
  MASTER_SCHEDULE_VIEW_DEFAULTS,
  masterScheduleViewPreferenceSchema,
  type MasterScheduleViewPreference,
} from "@/schemas/viewPreferences";
import {
  bibliographicSourcesRepo,
  curriculumDependenciesRepo,
  obsidianNotesRepo,
  subjectCompetenciesRepo,
  subjectFundamentalQuestionsRepo,
  topicCompetenciesRepo,
  topicFundamentalQuestionsRepo,
} from "@/database/entities";
import { openNoteInObsidian } from "@/services/obsidian";
import { completeTopic } from "@/services/completionXp";
import { scheduleSession } from "@/services/sessions";
import { buildMasterSchedule, type MasterSchedule, type ScheduleStep, type ScheduleStepStatus } from "@/services/masterSchedule";
import type { CareerData } from "./useCareerData";

const STATUS_LABEL: Record<ScheduleStepStatus, string> = {
  completado: "Completado",
  activo: "En curso",
  proximo: "Próximo",
  disponible: "Disponible",
  pendiente: "Pendiente",
  bloqueado: "Bloqueado",
};

const STATUS_COLOR: Record<ScheduleStepStatus, string> = {
  completado: "text-success",
  activo: "text-accent",
  proximo: "text-accent",
  disponible: "text-text-secondary",
  pendiente: "text-text-muted",
  bloqueado: "text-danger",
};

type Density = "compacto" | "detallado";

export function MasterScheduleView({ data, initialSearch }: { data: CareerData; initialSearch?: string }) {
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<MasterSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference<MasterScheduleViewPreference>(
    "career-master-schedule",
    masterScheduleViewPreferenceSchema,
    MASTER_SCHEDULE_VIEW_DEFAULTS,
  );
  const { view, density, search, expandedTopicId } = viewPrefs;
  const collapsedSubjects = useMemo(() => new Set(viewPrefs.collapsedSubjectIds), [viewPrefs.collapsedSubjectIds]);
  const [schedulingStep, setSchedulingStep] = useState<ScheduleStep | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");

  // ?buscar= desde "Ver bibliografía" del Mapa/Cronograma — prioriza el
  // valor que trae la URL sobre la preferencia guardada, y lo persiste.
  useEffect(() => {
    if (initialSearch) updateViewPrefs({ search: initialSearch }, { immediate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    const [subjectQuestionLinks, subjectCompetencyLinks, topicQuestionLinks, topicCompetencyLinks, notes, dependencies, bibliographicSources] =
      await Promise.all([
        subjectFundamentalQuestionsRepo.list(),
        subjectCompetenciesRepo.list(),
        topicFundamentalQuestionsRepo.list(),
        topicCompetenciesRepo.list(),
        obsidianNotesRepo.list({ where: "sodiac_id IS NOT NULL" }),
        curriculumDependenciesRepo.list(),
        bibliographicSourcesRepo.list({ where: "topic_id IS NOT NULL" }),
      ]);
    const result = await buildMasterSchedule({
      subjects: data.subjects,
      topics: data.topics,
      questions: data.questions,
      competencies: data.competencies,
      subjectQuestionLinks,
      subjectCompetencyLinks,
      dependencies,
      topicQuestionLinks,
      topicCompetencyLinks,
      notes,
      bibliographicSources,
    });
    setSchedule(result);
    setLoading(false);
  }, [data.subjects, data.topics, data.questions, data.competencies]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchLower = search.trim().toLowerCase();
  const filteredSteps = useMemo(() => {
    if (!schedule) return [];
    if (!searchLower) return schedule.steps;
    return schedule.steps.filter(
      (s) => s.topic.title.toLowerCase().includes(searchLower) || s.subject.title.toLowerCase().includes(searchLower),
    );
  }, [schedule, searchLower]);

  const stepsBySubject = useMemo(() => {
    const map = new Map<string, ScheduleStep[]>();
    for (const step of filteredSteps) {
      const list = map.get(step.subject.id) ?? [];
      list.push(step);
      map.set(step.subject.id, list);
    }
    return map;
  }, [filteredSteps]);

  async function handleComplete(step: ScheduleStep) {
    await completeTopic(step.topic.id);
    await load();
  }

  async function handleOpenNotes(step: ScheduleStep) {
    const notes = await obsidianNotesRepo.list({ where: "sodiac_id = ?", params: [step.topic.id] });
    if (notes[0]) await openNoteInObsidian(notes[0].vault_relative_path);
  }

  function handleStartSession(step: ScheduleStep) {
    navigate(
      `/sesiones/nueva?subjectId=${step.subject.id}&topicId=${step.topic.id}&fundamentalQuestionId=${
        step.primaryQuestion?.id ?? ""
      }&competencyId=${step.primaryCompetency?.id ?? ""}&objective=${encodeURIComponent(step.topic.title)}`,
    );
  }

  async function handleConfirmSchedule() {
    if (!schedulingStep || !scheduleDate) return;
    await scheduleSession(
      {
        subject_id: schedulingStep.subject.id,
        topic_id: schedulingStep.topic.id,
        fundamental_question_id: schedulingStep.primaryQuestion?.id ?? null,
        competency_id: schedulingStep.primaryCompetency?.id ?? null,
        session_type: "explicacion",
        observable_objective: schedulingStep.topic.title,
      },
      new Date(`${scheduleDate}T09:00:00`).toISOString(),
    );
    setSchedulingStep(null);
    setScheduleDate("");
  }

  function toggleSubjectCollapse(subjectId: string) {
    const next = new Set(collapsedSubjects);
    if (next.has(subjectId)) next.delete(subjectId);
    else next.add(subjectId);
    updateViewPrefs({ collapsedSubjectIds: Array.from(next) }, { immediate: true });
  }

  if (loading || !schedule) return <p className="text-sm text-text-muted">Calculando el recorrido…</p>;

  if (schedule.totalSteps === 0) {
    return (
      <p className="text-sm text-text-muted">
        Todavía no hay temas cargados en ninguna materia — no hay recorrido que mostrar.
      </p>
    );
  }

  return (
    <div>
      <div className="rounded border border-border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-xl">
            PASO {schedule.currentStepIndex ?? schedule.totalSteps} DE {schedule.totalSteps}
          </p>
          <p className="text-sm text-text-secondary">{schedule.percentComplete}% del recorrido completado</p>
        </div>
        {schedule.activeSubjectTitle && (
          <p className="mt-1 text-sm text-text-secondary">
            Materia activa: <span className="text-text-primary">{schedule.activeSubjectTitle}</span>
            {schedule.activeEtapa && <span className="text-text-muted"> · {schedule.activeEtapa}</span>}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Stat label="Completados" value={`${schedule.completedSteps} / ${schedule.totalSteps}`} />
          <Stat label="Restantes" value={String(schedule.totalSteps - schedule.completedSteps)} />
          <Stat label="XP completado (est.)" value={String(schedule.xpEarnedEstimate)} />
          <Stat label="XP restante (est.)" value={String(schedule.xpRemainingEstimate)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded border border-border-subtle bg-surface p-1">
          {(["linea", "materias"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateViewPrefs({ view: mode }, { immediate: true })}
              className={`rounded px-3 py-1 text-xs uppercase tracking-wide ${
                view === mode ? "bg-surface-elevated text-accent" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {mode === "linea" ? "Línea maestra" : "Por materias"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => updateViewPrefs({ search: e.target.value })}
            placeholder="Buscar tema o materia…"
            className="rounded border border-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => updateViewPrefs({ density: density === "compacto" ? "detallado" : "compacto" }, { immediate: true })}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
          >
            {density === "compacto" ? "Ver detallado" : "Ver compacto"}
          </button>
        </div>
      </div>

      {searchLower && (
        <p className="mt-2 text-xs text-text-muted">
          {filteredSteps.length} de {schedule.totalSteps} resultados
        </p>
      )}

      <div className="mt-3 space-y-1">
        {view === "linea" &&
          filteredSteps.map((step) => (
            <ScheduleRow
              key={step.topic.id}
              step={step}
              density={density}
              expanded={expandedTopicId === step.topic.id}
              onToggleExpand={() =>
                updateViewPrefs(
                  { expandedTopicId: expandedTopicId === step.topic.id ? null : step.topic.id },
                  { immediate: true },
                )
              }
              onComplete={() => void handleComplete(step)}
              onStartSession={() => handleStartSession(step)}
              onOpenSubject={() => navigate(`/carrera/${step.subject.id}`)}
              onOpenNotes={() => void handleOpenNotes(step)}
              onOpenMap={() => navigate(`/mapa?buscar=${encodeURIComponent(step.topic.title)}`)}
              onOpenBibliography={() => navigate(`/biblioteca?tema=${step.topic.id}`)}
              onSchedule={() => setSchedulingStep(step)}
            />
          ))}

        {view === "materias" &&
          [...stepsBySubject.entries()].map(([subjectId, steps]) => {
            const subject = steps[0]!.subject;
            const collapsed = collapsedSubjects.has(subjectId);
            const completedInSubject = steps.filter((s) => s.status === "completado").length;
            return (
              <div key={subjectId} className="rounded border border-border-subtle bg-surface">
                <button
                  onClick={() => toggleSubjectCollapse(subjectId)}
                  className="flex w-full items-center justify-between p-3 text-left"
                >
                  <span className="text-sm font-medium text-text-primary">
                    {subject.title}
                    <span className="ml-2 text-xs text-text-muted">
                      {completedInSubject}/{steps.length} · {steps[0]!.etapa}
                    </span>
                  </span>
                  <span className="text-xs text-text-muted">{collapsed ? "Expandir" : "Contraer"}</span>
                </button>
                {!collapsed && (
                  <div className="space-y-1 border-t border-border-subtle p-2">
                    {steps.map((step) => (
                      <ScheduleRow
                        key={step.topic.id}
                        step={step}
                        density={density}
                        expanded={expandedTopicId === step.topic.id}
                        onToggleExpand={() =>
                          updateViewPrefs(
                            { expandedTopicId: expandedTopicId === step.topic.id ? null : step.topic.id },
                            { immediate: true },
                          )
                        }
                        onComplete={() => void handleComplete(step)}
                        onStartSession={() => handleStartSession(step)}
                        onOpenSubject={() => navigate(`/carrera/${step.subject.id}`)}
                        onOpenNotes={() => void handleOpenNotes(step)}
                        onOpenMap={() => navigate(`/mapa?buscar=${encodeURIComponent(step.topic.title)}`)}
                        onOpenBibliography={() => navigate(`/biblioteca?tema=${step.topic.id}`)}
                        onSchedule={() => setSchedulingStep(step)}
                        hideSubjectLabel
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {schedulingStep && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8"
          onClick={() => setSchedulingStep(null)}
        >
          <div
            className="w-full max-w-sm rounded border border-border bg-surface-elevated p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg">Programar</h3>
            <p className="mt-1 text-xs text-text-muted">
              {schedulingStep.topic.title} · {schedulingStep.subject.title}
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Programar una fecha no cambia la posición de este tema en el recorrido — solo crea una sesión planificada.
            </p>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="mt-3 w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void handleConfirmSchedule()}
                disabled={!scheduleDate}
                className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm uppercase tracking-wide text-accent disabled:opacity-40"
              >
                Programar
              </button>
              <button
                onClick={() => setSchedulingStep(null)}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function ScheduleRow({
  step,
  density,
  expanded,
  hideSubjectLabel,
  onToggleExpand,
  onComplete,
  onStartSession,
  onOpenSubject,
  onOpenNotes,
  onOpenMap,
  onOpenBibliography,
  onSchedule,
}: {
  step: ScheduleStep;
  density: Density;
  expanded: boolean;
  hideSubjectLabel?: boolean;
  onToggleExpand: () => void;
  onComplete: () => void;
  onStartSession: () => void;
  onOpenSubject: () => void;
  onOpenNotes: () => void;
  onOpenMap: () => void;
  onOpenBibliography: () => void;
  onSchedule: () => void;
}) {
  const isDone = step.status === "completado";
  return (
    <div className="rounded border border-border-subtle bg-background/40 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onToggleExpand} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">#{step.globalIndex}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-primary">{step.topic.title}</span>
            {!hideSubjectLabel && (
              <span className="block truncate text-xs text-text-muted">
                {step.subject.title}
                {step.primaryCompetency ? ` · ${step.primaryCompetency.title}` : ""}
              </span>
            )}
          </span>
        </button>
        <span className={`shrink-0 text-xs uppercase tracking-wide ${STATUS_COLOR[step.status]}`}>
          {STATUS_LABEL[step.status]}
        </span>
        <span className="shrink-0 text-xs text-accent">+{step.xpAvailable} XP</span>
      </div>

      {(density === "detallado" || expanded) && (
        <div className="mt-2 space-y-1 border-t border-border-subtle pt-2 text-xs text-text-secondary">
          <p>
            <span className="text-text-muted">Etapa: </span>
            {step.etapa}
          </p>
          {step.primaryQuestion && (
            <p>
              <span className="text-text-muted">Pregunta fundamental: </span>
              {step.primaryQuestion.title}
            </p>
          )}
          {step.secondaryCompetencies.length > 0 && (
            <p>
              <span className="text-text-muted">Otras competencias: </span>
              {step.secondaryCompetencies.map((c) => c.title).join(", ")}
            </p>
          )}
          <p>
            <span className="text-text-muted">Notas de Obsidian relacionadas: </span>
            {step.relatedNoteCount}
          </p>
          <p>
            <span className="text-text-muted">Bibliografía recomendada: </span>
            {step.relatedResourceCount}
          </p>
          <p className="text-text-muted">
            {step.prerequisiteTopics.length === 0
              ? "Requisito: ninguno — es el primero de esta materia."
              : `Requiere completar: ${step.prerequisiteTopics.map((t) => t.title).join(", ")}.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={onStartSession}
              className="rounded border border-accent px-2 py-1 text-[11px] uppercase tracking-wide text-accent"
            >
              Iniciar estudio
            </button>
            <button
              onClick={onSchedule}
              className="rounded border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
            >
              Programar
            </button>
            <button
              onClick={onOpenSubject}
              className="rounded border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
            >
              Abrir materia
            </button>
            <button
              onClick={onOpenMap}
              className="rounded border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
            >
              Abrir en mapa
            </button>
            {step.relatedNoteCount > 0 && (
              <button
                onClick={onOpenNotes}
                className="rounded border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
              >
                Abrir notas
              </button>
            )}
            {step.relatedResourceCount > 0 && (
              <button
                onClick={onOpenBibliography}
                className="rounded border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
              >
                Ver bibliografía
              </button>
            )}
            {!isDone && (
              <button
                onClick={onComplete}
                className="rounded border border-success px-2 py-1 text-[11px] uppercase tracking-wide text-success"
              >
                Marcar como completado
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
