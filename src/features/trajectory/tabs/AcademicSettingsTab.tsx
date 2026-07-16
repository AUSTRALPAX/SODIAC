import { useCallback, useEffect, useState } from "react";
import { subjectsRepo } from "@/database/entities";
import { applySubjectXpBudgets, simulateSubjectXpBudgets, type SubjectXpBudget } from "@/services/xp";
import { DEFAULT_IPA_WEIGHTS, updateIpaWeights, ensureCurrentFormulaVersion, type IpaWeights } from "@/services/progress";
import type { SubjectRow } from "@/database/types";

export function AcademicSettingsTab({ onChanged }: { onChanged: () => void }) {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [simulation, setSimulation] = useState<SubjectXpBudget[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [weights, setWeights] = useState<IpaWeights>(DEFAULT_IPA_WEIGHTS);
  const [weightsLabel, setWeightsLabel] = useState("");
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSubjects(await subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }));
    const formula = await ensureCurrentFormulaVersion();
    setWeights(JSON.parse(formula.weights_json));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreditsChange(subjectId: string, credits: number) {
    await subjectsRepo.update(subjectId, { credits });
    await refresh();
  }

  async function handleSimulate() {
    setSimulation(await simulateSubjectXpBudgets());
  }

  async function handleApply() {
    if (!simulation) return;
    setApplying(true);
    try {
      await applySubjectXpBudgets(simulation);
      setSimulation(null);
      await refresh();
      onChanged();
    } finally {
      setApplying(false);
    }
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
          Escala 1 (corta/complementaria) a 5 (troncal/integradora). Define el peso de cada materia al distribuir los
          100.000 XP de la carrera.
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
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Presupuesto de XP por materia (100.000 XP totales)
          </h3>
          <button onClick={handleSimulate} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent">
            Simular
          </button>
        </div>

        {simulation && (
          <div className="mt-3">
            <table className="w-full rounded border border-border-subtle bg-surface text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-2">Materia</th>
                  <th className="px-3 py-2">Actual</th>
                  <th className="px-3 py-2">Propuesto</th>
                  <th className="px-3 py-2">Ya otorgado</th>
                </tr>
              </thead>
              <tbody>
                {simulation.map((b) => (
                  <tr key={b.subjectId} className="border-b border-border-subtle last:border-0">
                    <td className="px-3 py-2 text-text-primary">{b.title}</td>
                    <td className="px-3 py-2 text-text-muted">{b.currentBudgetedXp ?? "sin asignar"}</td>
                    <td className="px-3 py-2 text-accent">{b.proposedBudgetedXp.toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2 text-text-muted">
                      {b.hasHistory ? `${Math.round(b.alreadyAwardedXp)} XP (ya tiene historial)` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={handleApply}
              disabled={applying}
              className="mt-2 rounded border border-accent bg-accent/10 px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              {applying ? "Aplicando…" : "Confirmar y aplicar"}
            </button>
          </div>
        )}
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
