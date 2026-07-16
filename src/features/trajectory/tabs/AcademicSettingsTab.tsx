import { useCallback, useEffect, useState } from "react";
import { subjectsRepo } from "@/database/entities";
import {
  CATEGORY_WEIGHTS,
  COMPLETION_CATEGORY_WEIGHTS,
  GRADED_SHARE,
  COMPLETION_SHARE,
  listSubjectXpBudgets,
  type SubjectXpBudgetView,
} from "@/services/xp";
import { DEFAULT_IPA_WEIGHTS, updateIpaWeights, ensureCurrentFormulaVersion, type IpaWeights } from "@/services/progress";
import type { SubjectRow } from "@/database/types";

const GRADED_CATEGORY_LABEL: Record<string, string> = {
  notas_conceptuales: "Notas conceptuales",
  ejercicios_practicas: "Ejercicios y prácticas",
  aplicaciones_casos: "Aplicaciones y casos",
  proyecto_examen_integrador: "Proyecto o examen integrador",
  hitos_dominio: "Hitos de dominio",
  revision_diferida_retencion: "Revisión diferida (retención)",
  intento: "Intento (no llega al mínimo académico)",
};

const COMPLETION_CATEGORY_LABEL: Record<string, string> = {
  finalizacion_tarea_hito: "Completar una tarea o hito",
  finalizacion_tema: "Completar un tema",
  cierre_materia: "Cerrar una materia",
};

const SCORE_TIERS = [
  { range: "90 – 100", pct: "100%" },
  { range: "80 – 89", pct: "90%" },
  { range: "70 – 79", pct: "78%" },
  { range: "60 – 69", pct: "60%" },
  { range: "50 – 59", pct: "35%" },
  { range: "0 – 49", pct: "10%" },
];

export function AcademicSettingsTab({ onChanged }: { onChanged: () => void }) {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [budgets, setBudgets] = useState<SubjectXpBudgetView[]>([]);
  const [weights, setWeights] = useState<IpaWeights>(DEFAULT_IPA_WEIGHTS);
  const [weightsLabel, setWeightsLabel] = useState("");
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [subjectRows, budgetRows, formula] = await Promise.all([
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      listSubjectXpBudgets(),
      ensureCurrentFormulaVersion(),
    ]);
    setSubjects(subjectRows);
    setBudgets(budgetRows);
    setWeights(JSON.parse(formula.weights_json));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreditsChange(subjectId: string, credits: number) {
    await subjectsRepo.update(subjectId, { credits });
    await refresh();
    onChanged();
  }

  const weightsSum = weights.coverage + weights.mastery + weights.evidence + weights.retention + weights.projects;

  async function handleSaveWeights() {
    setWeightsError(null);
    if (Math.abs(weightsSum - 1) > 0.001) {
      setWeightsError(`Los pesos deben sumar 100% (suman ${(weightsSum * 100).toFixed(1)}%).`);
      return;
    }
    setSavingWeights(true);
    try {
      await updateIpaWeights(weights, weightsLabel.trim() || `v${Date.now()}`);
      setWeightsLabel("");
      onChanged();
    } catch (e) {
      setWeightsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingWeights(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Créditos por materia</h3>
        <p className="mt-1 text-xs text-text-muted">
          Escala 1 (corta/complementaria) a 5 (troncal/integradora). Define el peso de cada materia al repartir los
          100.000 XP de la carrera entre todas las materias activas.
        </p>
        <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {subjects.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="text-text-primary">{s.title}</span>
              <select
                value={s.credits}
                onChange={(e) => handleCreditsChange(s.id, Number(e.target.value))}
                className="rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                {[1, 2, 3, 4, 5].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Presupuesto de XP por materia (100.000 XP totales, en vivo)
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Se recalcula automáticamente cada vez que se agrega, se archiva o cambia los créditos de una materia — no
          hace falta ningún paso manual. Si sumás una materia nueva, el resto vale un poco menos por crédito a partir
          de ahora; el XP ya otorgado nunca cambia.
        </p>
        <table className="mt-3 w-full rounded border border-border-subtle bg-surface text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Materia</th>
              <th className="px-3 py-2">Créditos</th>
              <th className="px-3 py-2">Trabajo calificado</th>
              <th className="px-3 py-2">Finalización</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Ya ganado</th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((b) => (
              <tr key={b.subjectId} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 text-text-primary">{b.title}</td>
                <td className="px-3 py-2 text-text-muted">{b.credits}</td>
                <td className="px-3 py-2 text-text-secondary">{b.gradedBudget.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-text-secondary">{b.completionBudget.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-accent">{b.totalBudget.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-text-muted">{Math.round(b.earnedXp).toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">¿Cómo se gana XP?</h3>
        <p className="mt-1 text-xs text-text-muted">
          El presupuesto de cada materia se reparte en dos pools independientes:{" "}
          <span className="text-text-secondary">{Math.round(GRADED_SHARE * 100)}%</span> para trabajo calificado y{" "}
          <span className="text-text-secondary">{Math.round(COMPLETION_SHARE * 100)}%</span> para completar tareas,
          temas y materias directamente. Ninguno de los dos se puede exceder ni se resta si algo se reevalúa a la baja.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-text-secondary">Trabajo calificado (evaluación asistida)</p>
            <table className="mt-1 w-full rounded border border-border-subtle bg-surface text-xs">
              <tbody>
                {Object.entries(CATEGORY_WEIGHTS).map(([cat, weight]) => (
                  <tr key={cat} className="border-b border-border-subtle last:border-0">
                    <td className="px-2 py-1.5 text-text-secondary">{GRADED_CATEGORY_LABEL[cat] ?? cat}</td>
                    <td className="px-2 py-1.5 text-right text-accent">{Math.round(weight * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs font-semibold text-text-secondary">Multiplicador según la nota (0-100)</p>
            <table className="mt-1 w-full rounded border border-border-subtle bg-surface text-xs">
              <tbody>
                {SCORE_TIERS.map((t) => (
                  <tr key={t.range} className="border-b border-border-subtle last:border-0">
                    <td className="px-2 py-1.5 text-text-secondary">{t.range}</td>
                    <td className="px-2 py-1.5 text-right text-accent">{t.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-secondary">Finalización directa (sin ChatGPT)</p>
            <table className="mt-1 w-full rounded border border-border-subtle bg-surface text-xs">
              <tbody>
                {Object.entries(COMPLETION_CATEGORY_WEIGHTS).map(([cat, weight]) => (
                  <tr key={cat} className="border-b border-border-subtle last:border-0">
                    <td className="px-2 py-1.5 text-text-secondary">{COMPLETION_CATEGORY_LABEL[cat] ?? cat}</td>
                    <td className="px-2 py-1.5 text-right text-accent">{Math.round(weight * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-text-muted">
              Cada porcentaje se reparte además entre todos los temas (o tareas/hitos) activos de la materia — si una
              materia tiene 5 temas, cada uno recibe una quinta parte del presupuesto de "completar un tema".
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Ponderación del IPA</h3>
        <p className="mt-1 text-xs text-text-muted">Debe sumar exactamente 100%. Guardar crea una nueva versión de la fórmula.</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(weights) as (keyof IpaWeights)[]).map((key) => (
            <label key={key} className="text-xs text-text-secondary">
              {key}
              <input
                type="number"
                step={0.01}
                value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-text-muted">Suma actual: {(weightsSum * 100).toFixed(1)}%</p>
        <div className="mt-2 flex gap-2">
          <input
            value={weightsLabel}
            onChange={(e) => setWeightsLabel(e.target.value)}
            placeholder="Etiqueta de versión (ej. v1.1)"
            className="rounded border border-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleSaveWeights}
            disabled={savingWeights}
            className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
          >
            {savingWeights ? "Guardando…" : "Guardar nueva versión"}
          </button>
        </div>
        {weightsError && <p className="mt-1 text-xs text-danger">{weightsError}</p>}
      </section>
    </div>
  );
}
