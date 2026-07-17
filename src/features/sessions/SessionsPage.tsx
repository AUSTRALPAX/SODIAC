import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { EventClickArg } from "@fullcalendar/core";
import { useViewPreference } from "@/hooks/useViewPreference";
import { SESSIONS_VIEW_DEFAULTS, sessionsViewPreferenceSchema } from "@/schemas/viewPreferences";
import {
  competenciesRepo,
  fundamentalQuestionsRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type { StudySessionRow } from "@/database/types";
import {
  cancelSession,
  getRelatedTaskForSession,
  listSessions,
  markSessionIncomplete,
  reprogramSession,
  startScheduledSession,
} from "@/services/sessions";

const CLOSURE_LABEL: Record<StudySessionRow["closure_status"], string> = {
  en_curso: "En curso",
  formal: "Cerrada",
  cancelada: "Cancelada",
  incompleta: "Incompleta",
};

const CLOSURE_COLOR: Record<StudySessionRow["closure_status"], string> = {
  en_curso: "text-accent",
  formal: "text-success",
  cancelada: "text-danger",
  incompleta: "text-warning",
};

type ViewId = "proxima" | "programadas" | "en_curso" | "completadas" | "incompletas" | "canceladas" | "historial" | "calendario";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "proxima", label: "Próxima" },
  { id: "programadas", label: "Programadas" },
  { id: "en_curso", label: "En curso" },
  { id: "completadas", label: "Completadas" },
  { id: "incompletas", label: "Incompletas" },
  { id: "canceladas", label: "Canceladas" },
  { id: "historial", label: "Historial" },
  { id: "calendario", label: "Calendario" },
];

function isProgramada(s: StudySessionRow): boolean {
  return s.status === "programada";
}
function isEnCurso(s: StudySessionRow): boolean {
  return s.closure_status === "en_curso" && s.status === "activa";
}

export function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StudySessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference(
    "sessions",
    sessionsViewPreferenceSchema,
    SESSIONS_VIEW_DEFAULTS,
  );
  const view = viewPrefs.view as ViewId;
  const [reprogramTarget, setReprogramTarget] = useState<string | null>(null);
  const [reprogramDate, setReprogramDate] = useState("");

  const refresh = useCallback(async () => {
    setSessions(await listSessions());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scheduled = useMemo(() => sessions.filter(isProgramada).sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? "")), [sessions]);
  const inProgress = useMemo(() => sessions.filter(isEnCurso), [sessions]);
  const completed = useMemo(() => sessions.filter((s) => s.closure_status === "formal"), [sessions]);
  const incomplete = useMemo(() => sessions.filter((s) => s.closure_status === "incompleta"), [sessions]);
  const cancelled = useMemo(() => sessions.filter((s) => s.closure_status === "cancelada"), [sessions]);
  const historial = useMemo(
    () => [...completed, ...incomplete, ...cancelled].sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? "")),
    [completed, incomplete, cancelled],
  );
  const nextSession = inProgress[0] ?? scheduled[0] ?? null;

  async function handleStartScheduled(id: string) {
    await startScheduledSession(id);
    navigate(`/sesiones/${id}`);
  }

  async function handleCancel(id: string) {
    await cancelSession(id);
    await refresh();
  }

  async function handleIncomplete(id: string) {
    await markSessionIncomplete(id, "Marcada como incompleta desde Sesiones.");
    await refresh();
  }

  async function handleConfirmReprogram() {
    if (!reprogramTarget || !reprogramDate) return;
    await reprogramSession(reprogramTarget, new Date(reprogramDate).toISOString());
    setReprogramTarget(null);
    setReprogramDate("");
    await refresh();
  }

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="mx-auto max-w-3xl p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Sesiones</h1>
        <Link
          to="/sesiones/nueva"
          className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent"
        >
          Iniciar estudio
        </Link>
      </div>

      {nextSession && <NextSessionHeader session={nextSession} onStart={handleStartScheduled} />}

      <div className="mt-6 flex flex-wrap gap-1 border-b border-border-subtle">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => updateViewPrefs({ view: v.id }, { immediate: true })}
            className={`rounded-t px-3 py-2 text-xs uppercase tracking-wide ${
              view === v.id ? "border-b-2 border-accent text-accent" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {view === "proxima" && (
          nextSession ? (
            <SessionDetail session={nextSession} />
          ) : (
            <p className="text-sm text-text-muted">
              No hay ninguna sesión en curso ni programada. Podés{" "}
              <Link to="/sesiones/nueva" className="text-accent underline">
                iniciar una sesión libre
              </Link>
              .
            </p>
          )
        )}

        {view === "programadas" && (
          <SessionList
            sessions={scheduled}
            empty="No hay sesiones programadas."
            renderActions={(s) => (
              <>
                <ActionButton onClick={() => handleStartScheduled(s.id)} tone="success">
                  Iniciar ahora
                </ActionButton>
                <ActionButton
                  onClick={() => {
                    setReprogramTarget(s.id);
                    setReprogramDate("");
                  }}
                >
                  Reprogramar
                </ActionButton>
                <ActionButton onClick={() => handleCancel(s.id)} tone="danger">
                  Cancelar
                </ActionButton>
              </>
            )}
          />
        )}

        {view === "en_curso" && (
          <SessionList
            sessions={inProgress}
            empty="No hay sesiones en curso."
            renderActions={(s) => (
              <>
                <Link to={`/sesiones/${s.id}`} className="rounded border border-accent px-2 py-1 text-xs text-accent">
                  Continuar →
                </Link>
                <ActionButton onClick={() => handleIncomplete(s.id)}>Marcar incompleta</ActionButton>
                <ActionButton onClick={() => handleCancel(s.id)} tone="danger">
                  Cancelar
                </ActionButton>
              </>
            )}
          />
        )}

        {view === "completadas" && <SessionList sessions={completed} empty="Todavía no hay sesiones cerradas." />}

        {view === "incompletas" && (
          <SessionList
            sessions={incomplete}
            empty="No hay sesiones incompletas."
            renderActions={(s) => (
              <Link to={`/sesiones/${s.id}`} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent">
                Ver
              </Link>
            )}
          />
        )}

        {view === "canceladas" && <SessionList sessions={cancelled} empty="No hay sesiones canceladas." />}

        {view === "historial" && <SessionList sessions={historial} empty="Todavía no hay historial." showStatus />}

        {view === "calendario" && <SessionCalendar sessions={sessions} onSelect={(id) => navigate(`/sesiones/${id}`)} />}
      </div>

      {reprogramTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8" onClick={() => setReprogramTarget(null)}>
          <div className="w-full max-w-sm rounded border border-border bg-surface-elevated p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg">Reprogramar sesión</h3>
            <input
              type="datetime-local"
              value={reprogramDate}
              onChange={(e) => setReprogramDate(e.target.value)}
              className="mt-3 w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleConfirmReprogram}
              disabled={!reprogramDate}
              className="mt-3 w-full rounded border border-accent px-3 py-2 text-sm uppercase tracking-wide text-accent disabled:opacity-40"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  children,
  tone,
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "hover:border-success hover:text-success"
      : tone === "danger"
        ? "hover:border-danger hover:text-danger"
        : "hover:border-accent hover:text-accent";
  return (
    <button onClick={onClick} className={`rounded border border-border px-2 py-1 text-xs text-text-secondary ${toneClass}`}>
      {children}
    </button>
  );
}

function SessionList({
  sessions,
  empty,
  renderActions,
  showStatus,
}: {
  sessions: StudySessionRow[];
  empty: string;
  renderActions?: (s: StudySessionRow) => ReactNode;
  showStatus?: boolean;
}) {
  if (sessions.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-4 p-4 text-sm">
          <Link to={`/sesiones/${s.id}`} className="min-w-0 flex-1 hover:text-text-primary">
            <p className="truncate text-text-primary">{s.observable_objective}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {s.started_at && new Date(s.started_at).toLocaleString("es-AR")} · {s.session_type}
              {showStatus && <> · <span className={CLOSURE_COLOR[s.closure_status]}>{CLOSURE_LABEL[s.closure_status]}</span></>}
              {s.actual_duration_min ? ` · ${s.actual_duration_min} min` : ""}
            </p>
          </Link>
          {renderActions && <div className="flex shrink-0 gap-2">{renderActions(s)}</div>}
        </li>
      ))}
    </ul>
  );
}

function NextSessionHeader({ session, onStart }: { session: StudySessionRow; onStart: (id: string) => void }) {
  const [context, setContext] = useState<{
    question: string | null;
    competency: string | null;
    subject: string | null;
    topic: string | null;
  } | null>(null);
  const [relatedTaskTitle, setRelatedTaskTitle] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      session.fundamental_question_id ? fundamentalQuestionsRepo.getById(session.fundamental_question_id) : null,
      session.competency_id ? competenciesRepo.getById(session.competency_id) : null,
      session.subject_id ? subjectsRepo.getById(session.subject_id) : null,
      session.topic_id ? topicsRepo.getById(session.topic_id) : null,
      getRelatedTaskForSession(session.id),
    ]).then(([q, c, s, t, task]) => {
      setContext({ question: q?.title ?? null, competency: c?.title ?? null, subject: s?.title ?? null, topic: t?.title ?? null });
      setRelatedTaskTitle(task?.title ?? null);
    });
  }, [session]);

  const isScheduled = session.status === "programada";

  return (
    <div className="mt-6 rounded border border-accent/40 bg-accent/5 p-5">
      <p className="text-xs uppercase tracking-wide text-accent">
        {isScheduled ? "Próxima sesión programada" : "Sesión en curso"}
      </p>
      <h2 className="mt-1 font-display text-xl text-text-primary">{session.observable_objective}</h2>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {context?.question && <span>Pregunta: {context.question}</span>}
        {context?.competency && <span>Competencia: {context.competency}</span>}
        {context?.subject && <span>Materia: {context.subject}</span>}
        {context?.topic && <span>Tema: {context.topic}</span>}
        {session.planned_duration_min && <span>Duración: {session.planned_duration_min} min</span>}
        {session.started_at && (
          <span>{isScheduled ? "Programada para" : "Iniciada"}: {new Date(session.started_at).toLocaleString("es-AR")}</span>
        )}
      </div>
      {session.expected_product && (
        <p className="mt-2 text-xs text-text-muted">Producto esperado: {session.expected_product}</p>
      )}
      {relatedTaskTitle && <p className="mt-1 text-xs text-text-muted">Tarea relacionada: {relatedTaskTitle}</p>}
      <div className="mt-3 flex gap-2">
        {isScheduled ? (
          <button
            onClick={() => onStart(session.id)}
            className="rounded border border-accent bg-accent/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-accent"
          >
            Iniciar estudio
          </button>
        ) : (
          <Link
            to={`/sesiones/${session.id}`}
            className="rounded border border-accent bg-accent/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-accent"
          >
            Continuar sesión
          </Link>
        )}
      </div>
    </div>
  );
}

function SessionDetail({ session }: { session: StudySessionRow }) {
  return (
    <div className="rounded border border-border-subtle bg-surface p-4 text-sm">
      <p className="text-text-secondary">
        Punto de continuidad previo: {session.continuity_point || "sin registrar todavía."}
      </p>
      {session.resources && <p className="mt-2 text-text-secondary">Recursos: {session.resources}</p>}
      {session.prior_knowledge && <p className="mt-2 text-text-secondary">Conocimiento previo: {session.prior_knowledge}</p>}
    </div>
  );
}

const EVENT_COLOR: Record<string, string> = {
  programada: "#6F7980",
  en_curso: "#00D6C5",
  formal: "#43D69A",
  incompleta: "#E6B85C",
  cancelada: "#FF6B72",
};

function SessionCalendar({ sessions, onSelect }: { sessions: StudySessionRow[]; onSelect: (id: string) => void }) {
  const events = sessions
    .filter((s) => s.started_at)
    .map((s) => ({
      id: s.id,
      title: s.observable_objective ?? "Sesión sin objetivo registrado",
      start: s.started_at!,
      color: EVENT_COLOR[isProgramada(s) ? "programada" : s.closure_status] ?? "#6F7980",
    }));

  return (
    <div className="sodiac-calendar rounded border border-border-subtle bg-surface p-3">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={esLocale}
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" }}
        height="auto"
        events={events}
        eventClick={(arg: EventClickArg) => onSelect(arg.event.id)}
      />
    </div>
  );
}
