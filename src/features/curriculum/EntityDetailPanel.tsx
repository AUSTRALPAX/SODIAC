import { Link } from "react-router-dom";
import { TYPE_COLOR, TYPE_LABEL, type MapEntityType } from "./mapTypeColors";
import type { CurriculumData } from "./useCurriculumData";

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
      return 0;
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

  return (
    <div className="absolute right-3 top-3 z-10 w-72 rounded border border-border bg-surface-elevated p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className="inline-block rounded px-2 py-0.5 text-xs uppercase tracking-wide"
            style={{ color: TYPE_COLOR[entity.type], border: `1px solid ${TYPE_COLOR[entity.type]}` }}
          >
            {TYPE_LABEL[entity.type]}
          </span>
          <h3 className="mt-2 font-display text-sm text-text-primary">{label ?? "(sin título)"}</h3>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          ✕
        </button>
      </div>

      <p className="mt-2 text-xs text-text-muted">{connectedCount(entity, data)} elemento(s) conectado(s) directamente.</p>

      {entity.type === "subject" && (
        <Link
          to={`/carrera/${entity.id}`}
          className="mt-3 inline-block rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10"
        >
          Abrir en Carrera
        </Link>
      )}
      {entity.type === "project" && (
        <Link
          to="/proyectos"
          className="mt-3 inline-block rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10"
        >
          Abrir en Proyectos
        </Link>
      )}
    </div>
  );
}
