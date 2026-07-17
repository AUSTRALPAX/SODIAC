import { useSearchParams } from "react-router-dom";
import { useViewPreference } from "@/hooks/useViewPreference";
import { MAP_VIEW_DEFAULTS, mapViewPreferenceSchema } from "@/schemas/viewPreferences";
import { useCurriculumData } from "./useCurriculumData";
import { TreeView } from "./TreeView";
import { TableView } from "./TableView";
import { RelationsView } from "./RelationsView";

type ViewMode = "arbol" | "tabla" | "mapa";

export function CurriculumPage() {
  const data = useCurriculumData();
  const [searchParams] = useSearchParams();
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference("map", mapViewPreferenceSchema, MAP_VIEW_DEFAULTS);
  // Si se llega con ?buscar= (por ejemplo desde "Abrir en mapa" del Cronograma
  // Maestro), arrancar directamente en "Mapa de relaciones", que es donde
  // vive la búsqueda — no en "Árbol", sin importar la vista guardada.
  const view: ViewMode = searchParams.get("buscar") ? "mapa" : (viewPrefs.view as ViewMode);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Mapa</h1>
        <div className="flex gap-1 rounded border border-border-subtle bg-surface p-1">
          {(["arbol", "tabla", "mapa"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateViewPrefs({ view: mode }, { immediate: true })}
              className={`rounded px-3 py-1 text-xs uppercase tracking-wide ${
                view === mode ? "bg-surface-elevated text-accent" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {mode === "arbol" ? "Árbol" : mode === "tabla" ? "Tabla" : "Mapa de relaciones"}
            </button>
          ))}
        </div>
      </div>

      {data.loading ? (
        <p className="mt-6 text-sm text-text-muted">Cargando…</p>
      ) : data.questions.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          Todavía no hay estructura académica. Importala desde Configuración → Datos institucionales.
        </p>
      ) : (
        <div className="mt-6">
          {view === "arbol" && <TreeView data={data} />}
          {view === "tabla" && <TableView data={data} />}
          {view === "mapa" && <RelationsView data={data} />}
        </div>
      )}
    </div>
  );
}
