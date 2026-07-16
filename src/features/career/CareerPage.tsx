import { useState } from "react";
import { useCareerData } from "./useCareerData";
import { RecorridoView } from "./RecorridoView";
import { MallaView } from "./MallaView";
import { TemarioView } from "./TemarioView";
import { CronogramaView } from "./CronogramaView";

type CareerViewMode = "recorrido" | "malla" | "temario" | "cronograma";

const VIEW_LABEL: Record<CareerViewMode, string> = {
  recorrido: "Recorrido",
  malla: "Malla curricular",
  temario: "Temario completo",
  cronograma: "Cronograma",
};

export function CareerPage() {
  const data = useCareerData();
  const [view, setView] = useState<CareerViewMode>("recorrido");

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Carrera</h1>
          <p className="mt-1 text-sm text-text-muted">El recorrido completo, ordenado — qué se estudia primero y qué sigue.</p>
        </div>
        <div className="flex gap-1 rounded border border-border-subtle bg-surface p-1">
          {(["recorrido", "malla", "temario", "cronograma"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
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
          {view === "cronograma" && <CronogramaView data={data} />}
        </div>
      )}
    </div>
  );
}
