import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useViewPreference } from "@/hooks/useViewPreference";
import { CAREER_VIEW_DEFAULTS, careerViewPreferenceSchema } from "@/schemas/viewPreferences";
import { useCareerData } from "./useCareerData";
import { RecorridoView } from "./RecorridoView";
import { MallaView } from "./MallaView";
import { TemarioView } from "./TemarioView";
import { MasterScheduleView } from "./MasterScheduleView";
import { ReversalHistoryView } from "./ReversalHistoryView";

type CareerViewMode = "recorrido" | "malla" | "temario" | "cronograma-maestro" | "historial-estado";

const VIEW_LABEL: Record<CareerViewMode, string> = {
  recorrido: "Recorrido",
  malla: "Malla curricular",
  temario: "Temario completo",
  "cronograma-maestro": "Cronograma Maestro",
  "historial-estado": "Historial de estado",
};

const VALID_VIEWS = new Set<CareerViewMode>([
  "recorrido",
  "malla",
  "temario",
  "cronograma-maestro",
  "historial-estado",
]);

export function CareerPage() {
  const data = useCareerData();
  const [searchParams] = useSearchParams();
  // Permite llegar con ?tab=cronograma-maestro&buscar=... (por ejemplo desde
  // "Abrir en Cronograma Maestro" del panel del Mapa) directamente en esa
  // pestaña, con la búsqueda prellenada.
  const tabParam = searchParams.get("tab");
  const { value: viewPrefs, update: updateViewPrefs, loaded: viewPrefsLoaded } = useViewPreference(
    "career",
    careerViewPreferenceSchema,
    CAREER_VIEW_DEFAULTS,
  );
  // El deep-link se aplica una sola vez, al llegar — y sólo después de que
  // termine de cargar la preferencia persistida. `useViewPreference` arranca
  // en sus valores por defecto y los reemplaza en cuanto resuelve la lectura
  // async de user_setting; si el efecto de acá corriera antes de esa carga
  // (como pasaba sin el `viewPrefsLoaded`), la carga posterior pisaría el
  // valor recién puesto por el deep-link con lo que hubiera quedado guardado
  // de la sesión anterior — se vio en la verificación en vivo de la Entrega 2.
  useEffect(() => {
    if (viewPrefsLoaded && tabParam && VALID_VIEWS.has(tabParam as CareerViewMode)) {
      updateViewPrefs({ view: tabParam }, { immediate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam, viewPrefsLoaded]);
  const view = viewPrefs.view as CareerViewMode;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Carrera</h1>
          <p className="mt-1 text-sm text-text-muted">El recorrido completo, ordenado — qué se estudia primero y qué sigue.</p>
        </div>
        <div className="flex gap-1 rounded border border-border-subtle bg-surface p-1">
          {(["recorrido", "malla", "temario", "cronograma-maestro", "historial-estado"] as const).map((mode) => (
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
          {view === "historial-estado" && <ReversalHistoryView />}
        </div>
      )}
    </div>
  );
}
