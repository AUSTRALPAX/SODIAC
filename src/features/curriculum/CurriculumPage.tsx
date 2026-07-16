import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurriculumData } from "./useCurriculumData";
import { TreeView } from "./TreeView";
import { TableView } from "./TableView";
import { RelationsView } from "./RelationsView";

type ViewMode = "arbol" | "tabla" | "mapa";

export function CurriculumPage() {
  const data = useCurriculumData();
  const [searchParams] = useSearchParams();
  // Si se llega con ?buscar= (por ejemplo desde "Abrir en mapa" del Cronograma
  // Maestro), arrancar directamente en "Mapa de relaciones", que es donde
  // vive la búsqueda — no en "Árbol".
  const [view, setView] = useState<ViewMode>(searchParams.get("buscar") ? "mapa" : "arbol");

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Mapa</h1>
        <div className="flex gap-1 rounded border border-border-subtle bg-surface p-1">
          {(["arbol", "tabla", "mapa"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
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
