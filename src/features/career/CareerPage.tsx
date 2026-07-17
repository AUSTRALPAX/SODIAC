import { useSearchParams } from "react-router-dom";
import { useViewPreference } from "@/hooks/useViewPreference";
import { CAREER_VIEW_DEFAULTS, careerViewPreferenceSchema } from "@/schemas/viewPreferences";
import { useCareerData } from "./useCareerData";
import { RecorridoView } from "./RecorridoView";
import { MallaView } from "./MallaView";
import { TemarioView } from "./TemarioView";
import { MasterScheduleView } from "./MasterScheduleView";

type CareerViewMode = "recorrido" | "malla" | "temario" | "cronograma-maestro";

const VIEW_LABEL: Record<CareerViewMode, string> = {
  recorrido: "Recorrido",
  malla: "Malla curricular",
  temario: "Temario completo",
  "cronograma-maestro": "Cronograma Maestro",
};

const VALID_VIEWS = new Set<CareerViewMode>(["recorrido", "malla", "temario", "cronograma-maestro"]);

export function CareerPage() {
  const data = useCareerData();
  const [searchParams] = useSearchParams();
  // Permite llegar con ?tab=cronograma-maestro&buscar=... (por ejemplo desde
  // "Abrir en Cronograma Maestro" del panel del Mapa) directamente en esa
  // pestaña, con la búsqueda prellenada.
  const tabParam = searchParams.get("tab");
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference(
    "career",
    careerViewPreferenceSchema,
    CAREER_VIEW_DEFAULTS,
  );
  const view: CareerViewMode =
    tabParam && VALID_VIEWS.has(tabParam as CareerViewMode) ? (tabParam as CareerViewMode) : (viewPrefs.view as CareerViewMode);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Carrera</h1>
          <p className="mt-1 text-sm text-text-muted">El recorrido completo, ordenado — qué se estudia primero y qué sigue.</p>
        </div>
        <div className="flex gap-1 rounded border border-border-subtle bg-surface p-1">
          {(["recorrido", "malla", "temario", "cronograma-maestro"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateViewPrefs({ view: mode }, { immediate: true })}
              className={`rounded px-3 py-1 text-xs uppercase tracking-wide ${
                view === mode ? "bg-surface-elevated text-accent" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {VIEW_LABEL[mode]}
            </button>
          ))}
        </div>
      </div>

      {data.loading ? (
        <p className="mt-6 text-sm text-text-muted">Cargando…</p>
      ) : data.subjects.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          Todavía no hay materias cargadas. Importá el currículo desde Configuración o cargalo materia por materia.
        </p>
      ) : (
        <div className="mt-6">
          {view === "recorrido" && <RecorridoView data={data} />}
          {view === "malla" && <MallaView data={data} />}
          {view === "temario" && <TemarioView data={data} />}
          {view === "cronograma-maestro" &&
            (searchParams.get("buscar") ? (
              <MasterScheduleView data={data} initialSearch={searchParams.get("buscar")!} />
            ) : (
              <MasterScheduleView data={data} />
            ))}
        </div>
      )}
    </div>
  );
}
