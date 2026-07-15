import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getInProgressSession, listSessions } from "@/services/sessions";
import type { StudySessionRow } from "@/database/types";

const CLOSURE_LABEL: Record<StudySessionRow["closure_status"], string> = {
  en_curso: "En curso",
  formal: "Cerrada",
  cancelada: "Cancelada",
  incompleta: "Incompleta",
};

export function SessionsPage() {
  const [sessions, setSessions] = useState<StudySessionRow[]>([]);
  const [inProgress, setInProgress] = useState<StudySessionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([listSessions(), getInProgressSession()]).then(([all, active]) => {
      setSessions(all);
      setInProgress(active);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Sesiones</h1>
        <Link
          to="/sesiones/nueva"
          className="rounded border border-accent px-4 py-2 text-sm uppercase tracking-wide text-accent"
        >
          Iniciar estudio
        </Link>
      </div>

      {inProgress && (
        <Link
          to={`/sesiones/${inProgress.id}`}
          className="mt-6 block rounded border border-accent bg-accent/10 p-4 text-sm text-accent"
        >
          Tenés una sesión interrumpida: "{inProgress.observable_objective}" — continuar →
        </Link>
      )}

      <div className="mt-8">
        {loading ? (
          <p className="text-sm text-text-muted">Cargando…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no hay sesiones registradas.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link to={`/sesiones/${s.id}`} className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-surface-hover">
                  <div>
                    <p className="text-text-primary">{s.observable_objective}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {s.started_at && new Date(s.started_at).toLocaleString("es-AR")} ·{" "}
                      {s.session_type} · {CLOSURE_LABEL[s.closure_status]}
                      {s.actual_duration_min ? ` · ${s.actual_duration_min} min` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
