import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { StudySessionRow } from "@/database/types";
import { cancelSession, getInProgressSession, markSessionIncomplete } from "@/services/sessions";

/**
 * Recuperación de sesión interrumpida (H3, corrección de persistencia): si
 * al cargar cualquier pantalla hay una sesión `en_curso` que no es la que
 * se está viendo ahora mismo, probablemente la app se cerró antes de
 * finalizarla — ofrece las 5 acciones del pedido original en vez de dejar
 * la sesión "perdida" en la lista.
 */
export function SessionRecoveryBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<StudySessionRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const row = await getInProgressSession();
    setSession(row);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  if (!session || dismissed) return null;
  if (location.pathname === `/sesiones/${session.id}`) return null;

  const hasDraft = Boolean(
    session.conclusion || session.evidence_summary || session.next_action || session.continuity_point,
  );

  async function handleDiscard() {
    if (!session) return;
    const confirmed = window.confirm("¿Descartar esta sesión sin finalizar? Quedará registrada como cancelada.");
    if (!confirmed) return;
    setBusy(true);
    try {
      await cancelSession(session.id);
      setDismissed(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkIncomplete() {
    if (!session) return;
    setBusy(true);
    try {
      await markSessionIncomplete(session.id, "Guardada como incompleta desde el aviso de recuperación.");
      setDismissed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-accent/40 bg-accent/10 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-text-primary">
          Encontramos una sesión sin finalizar: <span className="font-medium">{session.observable_objective}</span>
          {session.started_at && (
            <span className="text-text-muted"> · iniciada {new Date(session.started_at).toLocaleString("es-AR")}</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate(`/sesiones/${session.id}`)}
            className="rounded border border-accent px-3 py-1 text-xs uppercase tracking-wide text-accent"
          >
            Continuar
          </button>
          {hasDraft && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded border border-border px-3 py-1 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
            >
              {expanded ? "Ocultar" : "Revisar"}
            </button>
          )}
          <button
            onClick={() => navigate(`/sesiones/${session.id}`, { state: { autoFinalize: true } })}
            className="rounded border border-border px-3 py-1 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
          >
            Finalizar ahora
          </button>
          <button
            onClick={() => void handleMarkIncomplete()}
            disabled={busy}
            className="rounded border border-border px-3 py-1 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Guardar como incompleta
          </button>
          <button
            onClick={() => void handleDiscard()}
            disabled={busy}
            className="rounded border border-danger px-3 py-1 text-xs uppercase tracking-wide text-danger disabled:opacity-40"
          >
            Descartar
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 rounded border border-border-subtle bg-surface p-3 text-xs text-text-secondary">
          {session.conclusion && <p><span className="text-text-muted">Conclusión: </span>{session.conclusion}</p>}
          {session.evidence_summary && <p><span className="text-text-muted">Evidencia: </span>{session.evidence_summary}</p>}
          {session.next_action && <p><span className="text-text-muted">Próxima acción: </span>{session.next_action}</p>}
          {session.continuity_point && <p><span className="text-text-muted">Punto de continuidad: </span>{session.continuity_point}</p>}
        </div>
      )}
    </div>
  );
}
