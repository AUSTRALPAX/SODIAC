import { useEffect, useState } from "react";
import { listReversalHistory, type ReversalHistoryEntry } from "@/services/completionReversal";

/**
 * Historial de estado: todas las reversiones de "Marcar como completado",
 * de más reciente a más antigua. Complementa el historial de conocimiento
 * (KnowledgeHistoryPanel), que muestra sesiones/repasos/XP pero no distingue
 * una reversión de un evento de XP cualquiera.
 */
export function ReversalHistoryView() {
  const [entries, setEntries] = useState<ReversalHistoryEntry[] | null>(null);

  useEffect(() => {
    void listReversalHistory().then(setEntries);
  }, []);

  if (entries === null) return <p className="text-sm text-text-muted">Cargando…</p>;

  if (entries.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Todavía no se corrigió ningún estado. Acá van a aparecer los temas o materias que se marcaron como
        completados por error y se revirtieron.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded border border-border-subtle bg-surface p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-primary">
              {e.entity_type === "topic" ? "Tema" : "Materia"}: {e.entityTitle}
            </span>
            <span className="text-xs text-text-muted">
              {new Date(e.reverted_at).toLocaleString("es-AR")}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Motivo: {e.reasonLabel}
            {e.user_note ? ` — "${e.user_note}"` : ""}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {e.reversal_xp_event_id
              ? "XP compensado con un evento negativo (el original se conserva sin cambios)."
              : "Este elemento no tenía XP de finalización asociado."}
            {e.purged_level_history > 0 &&
              ` Se ajustaron ${e.purged_level_history} fila(s) del historial de nivel que habían quedado por encima del nivel real.`}
          </p>
        </li>
      ))}
    </ul>
  );
}
