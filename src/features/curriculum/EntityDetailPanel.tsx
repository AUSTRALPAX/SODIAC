import { Link, useNavigate } from "react-router-dom";
import { openNoteInObsidian } from "@/services/obsidian";
import { TYPE_COLOR, TYPE_LABEL, type MapEntityType } from "./mapTypeColors";
import type { CurriculumData } from "./useCurriculumData";
import { computeTopicLearningState } from "@/services/learningState";
import { TopicStateBadge } from "@/components/TopicStateBadge";

export interface SelectedEntity {
  type: MapEntityType;
  id: string;
}

function connectedCount(entity: SelectedEntity, data: CurriculumData): number {
  switch (entity.type) {
    case "fundamental_question":
      return data.subjects.filter((s) => s.fundamental_question_id === entity.id).length;
    case "competency":
      return data.topics.filter((t) => t.competency_id === entity.id).length;
    case "subject":
      return data.topics.filter((t) => t.subject_id === entity.id).length + data.units.filter((u) => u.subject_id === entity.id).length;
    case "curriculum_unit":
      return data.topics.filter((t) => t.curriculum_unit_id === entity.id).length;
    case "topic":
      return data.notes.filter((n) => n.sodiac_id === entity.id).length;
    case "project":
      return 0;
    default:
      return 0;
  }
}

export function EntityDetailPanel({
  entity,
  data,
  onClose,
}: {
  entity: SelectedEntity;
  data: CurriculumData;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const label = (() => {
    switch (entity.type) {
      case "fundamental_question":
        return data.questions.find((q) => q.id === entity.id)?.title;
      case "competency":
        return data.competencies.find((c) => c.id === entity.id)?.title;
      case "subject":
        return data.subjects.find((s) => s.id === entity.id)?.title;
      case "curriculum_unit":
        return data.units.find((u) => u.id === entity.id)?.title;
      case "topic":
        return data.topics.find((t) => t.id === entity.id)?.title;
      case "project":
        return data.projects.find((p) => p.id === entity.id)?.title;
      default:
        return undefined;
    }
  })();

  // Relaciones secundarias (sección 19): además de la jerárquica primaria
  // (pregunta→competencia→materia→tema) que ya define el layout, una
  // materia o tema puede declarar más de una pregunta/competencia.
  const secondaryQuestions =
    entity.type === "subject"
      ? data.subjectQuestionLinks.filter((l) => l.subject_id === entity.id).map((l) => data.questions.find((q) => q.id === l.fundamental_question_id)).filter((q): q is NonNullable<typeof q> => !!q)
      : entity.type === "topic"
        ? data.topicQuestionLinks.filter((l) => l.topic_id === entity.id).map((l) => data.questions.find((q) => q.id === l.fundamental_question_id)).filter((q): q is NonNullable<typeof q> => !!q)
        : [];
  const secondaryCompetencies =
    entity.type === "subject"
      ? data.subjectCompetencyLinks.filter((l) => l.subject_id === entity.id).map((l) => data.competencies.find((c) => c.id === l.competency_id)).filter((c): c is NonNullable<typeof c> => !!c)
      : entity.type === "topic"
        ? data.topicCompetencyLinks.filter((l) => l.topic_id === entity.id).map((l) => data.competencies.find((c) => c.id === l.competency_id)).filter((c): c is NonNullable<typeof c> => !!c)
        : [];

  const relatedNotes = entity.type === "topic" ? data.notes.filter((n) => n.sodiac_id === entity.id) : [];

  const subjectForCronograma = entity.type === "topic" ? data.topics.find((t) => t.id === entity.id) : null;

  return (
    <div className="absolute right-3 top-3 z-10 max-h-[calc(70vh-1.5rem)] w-72 overflow-y-auto rounded border border-border bg-surface-elevated p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className="inline-block rounded px-2 py-0.5 text-xs uppercase tracking-wide"
            style={{ color: TYPE_COLOR[entity.type], border: `1px solid ${TYPE_COLOR[entity.type]}` }}
          >
            {TYPE_LABEL[entity.type]}
          </span>
          <h3 className="mt-2 font-display text-sm text-text-primary">{label ?? "(sin título)"}</h3>
          {entity.type === "topic" && (
            <div className="mt-1">
              <TopicStateBadge
                state={computeTopicLearningState({
                  completedAt: subjectForCronograma?.completed_at ?? null,
                  ...data.learningSignals.get(entity.id),
                })}
              />
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          ✕
        </button>
      </div>

      <p className="mt-2 text-xs text-text-muted">{connectedCount(entity, data)} elemento(s) conectado(s) directamente.</p>

      {secondaryQuestions.length > 0 && (
        <p className="mt-2 text-xs text-text-secondary">
          <span className="text-text-muted">Otras preguntas: </span>
          {secondaryQuestions.map((q) => q.title).join(" · ")}
        </p>
      )}
      {secondaryCompetencies.length > 0 && (
        <p className="mt-1 text-xs text-text-secondary">
          <span className="text-text-muted">Otras competencias: </span>
          {secondaryCompetencies.map((c) => c.title).join(" · ")}
        </p>
      )}

      {relatedNotes.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border-subtle pt-2">
          <p className="text-xs text-text-muted">Notas de Obsidian ({relatedNotes.length}):</p>
          {relatedNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => void openNoteInObsidian(note.vault_relative_path)}
              className="block truncate text-left text-xs text-accent hover:underline"
            >
              {note.title ?? note.vault_relative_path}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {entity.type === "subject" && (
          <Link
            to={`/carrera/${entity.id}`}
            className="inline-block rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10"
          >
            Abrir en Carrera
          </Link>
        )}
        {entity.type === "project" && (
          <Link
            to="/proyectos"
            className="inline-block rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10"
          >
            Abrir en Proyectos
          </Link>
        )}
        {entity.type === "topic" && subjectForCronograma && (
          <button
            onClick={() =>
              navigate(
                `/carrera?tab=cronograma-maestro&buscar=${encodeURIComponent(subjectForCronograma.title)}`,
              )
            }
            className="inline-block rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10"
          >
            Abrir en Cronograma Maestro
          </button>
        )}
      </div>
    </div>
  );
}
