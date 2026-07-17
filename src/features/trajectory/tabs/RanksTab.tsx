import { useCallback, useEffect, useState } from "react";
import {
  exportRanks,
  listRanks,
  rankInitials,
  restoreDefaultRanks,
  setRankActive,
  swapRankIdentities,
  updateRank,
} from "@/services/ranks";
import type { AcademicRankRow } from "@/database/types";

export function RanksTab({ currentLevel, onChanged }: { currentLevel: number; onChanged: () => void }) {
  const [ranks, setRanks] = useState<AcademicRankRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editMinLevel, setEditMinLevel] = useState(0);
  const [editMaxLevel, setEditMaxLevel] = useState(0);
  const [swapping, setSwapping] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRanks(await listRanks());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startEdit(rank: AcademicRankRow) {
    setEditingId(rank.id);
    setEditName(rank.name);
    setEditSubtitle(rank.subtitle ?? "");
    setEditMinLevel(rank.minimum_level);
    setEditMaxLevel(rank.maximum_level);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    await updateRank(editingId, {
      name: editName,
      subtitle: editSubtitle || null,
      minimumLevel: editMinLevel,
      maximumLevel: editMaxLevel,
    });
    setEditingId(null);
    await refresh();
    onChanged();
  }

  async function handleSwap(rankId: string, otherRankId: string) {
    if (!otherRankId || otherRankId === rankId) return;
    await swapRankIdentities(rankId, otherRankId);
    setSwapping(null);
    await refresh();
    onChanged();
  }

  async function handleToggleActive(rank: AcademicRankRow) {
    await setRankActive(rank.id, !rank.is_active);
    await refresh();
  }

  async function handleRestoreDefaults() {
    await restoreDefaultRanks();
    await refresh();
    onChanged();
  }

  async function handleExport() {
    const data = await exportRanks();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sodiac-rangos-academicos.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex justify-end gap-2">
        <button onClick={handleExport} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent">
          Exportar
        </button>
        <button onClick={handleRestoreDefaults} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-danger hover:text-danger">
          Restaurar distribución predeterminada
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {ranks.map((rank) => {
          const isCurrent = currentLevel >= rank.minimum_level && currentLevel <= rank.maximum_level;
          return (
            <li
              key={rank.id}
              className={`flex items-center gap-4 rounded border p-3 text-sm ${
                isCurrent ? "border-accent bg-accent/5" : "border-border-subtle bg-surface"
              } ${!rank.is_active ? "opacity-40" : ""}`}
            >
              {rank.badge ? (
                <img
                  src={rank.badge}
                  alt={rank.name}
                  className="h-10 w-10 shrink-0 rounded-full border border-accent object-cover"
                />
              ) : (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                >
                  {rankInitials(rank.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {editingId === rank.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                    />
                    <input
                      value={editSubtitle}
                      onChange={(e) => setEditSubtitle(e.target.value)}
                      placeholder="Título"
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                    />
                    <label className="flex items-center gap-1 text-xs text-text-secondary">
                      Nivel
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editMinLevel}
                        onChange={(e) => setEditMinLevel(Number(e.target.value))}
                        className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                      />
                      –
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editMaxLevel}
                        onChange={(e) => setEditMaxLevel(Number(e.target.value))}
                        className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                      />
                    </label>
                    <button onClick={handleSaveEdit} className="rounded border border-accent px-2 py-1 text-xs text-accent">
                      Guardar
                    </button>
                  </div>
                ) : swapping === rank.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-text-secondary">Cambiar de lugar con:</span>
                    <select
                      defaultValue=""
                      onChange={(e) => void handleSwap(rank.id, e.target.value)}
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                    >
                      <option value="" disabled>
                        Elegir rango…
                      </option>
                      {ranks
                        .filter((r) => r.id !== rank.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            Nivel {r.minimum_level}–{r.maximum_level} · {r.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => setSwapping(null)}
                      className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-text-primary">
                      Nivel {rank.minimum_level}–{rank.maximum_level} · {rank.name}
                    </p>
                    <p className="text-xs text-text-muted">{rank.subtitle}</p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button onClick={() => startEdit(rank)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
                  Editar
                </button>
                <button onClick={() => setSwapping(rank.id)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
                  Cambiar de lugar
                </button>
                <button onClick={() => handleToggleActive(rank)} className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent">
                  {rank.is_active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
