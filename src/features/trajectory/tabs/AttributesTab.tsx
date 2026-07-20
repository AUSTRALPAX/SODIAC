import { useCallback, useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { computeAttributeScores, type AttributeScore } from "@/services/attributes";

const GRID_COLOR = "#1D2328";
const AXIS_COLOR = "#6F7980";
const TOOLTIP_STYLE = {
  background: "#171B20",
  border: "1px solid #293037",
  borderRadius: 6,
  fontSize: 12,
  color: "#F4F7F8",
};

export function AttributesTab() {
  const [scores, setScores] = useState<AttributeScore[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setScores(await computeAttributeScores());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <p className="text-sm text-text-muted">Cargando…</p>;

  const radarData = scores.map((s) => ({
    name: s.name,
    valor: s.percentOf5 ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          En qué te estás convirtiendo
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Dominio ponderado por atributo académico, calculado solo sobre los temas que ya tienen
          una relación de atributo asignada y una evaluación de dominio registrada.
        </p>
      </div>

      <div className="h-80 rounded border border-border-subtle bg-surface p-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="70%">
            <PolarGrid stroke={GRID_COLOR} />
            <PolarAngleAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: AXIS_COLOR, fontSize: 10 }} />
            <Radar name="Dominio (% de 5)" dataKey="valor" stroke="#4FD1C5" fill="#4FD1C5" fillOpacity={0.35} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [`${value.toFixed(0)}%`, "Dominio"]} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Atributo</th>
              <th className="px-3 py-2">Dominio</th>
              <th className="px-3 py-2">Cobertura</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.attributeId} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 text-text-primary">{s.name}</td>
                <td className="px-3 py-2 text-text-secondary">
                  {s.weightedMasteryLevel != null ? `${s.weightedMasteryLevel.toFixed(1)} / 5` : "Sin datos todavía"}
                </td>
                <td className="px-3 py-2 text-text-secondary">
                  {s.topicsClassified === 0
                    ? "0 temas clasificados"
                    : `${s.topicsClassified} temas clasificados · ${s.topicsEvaluated} evaluados`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
