import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { SodiacLogo } from "@/components/brand/SodiacLogo";
import { recommendNextAction, type Recommendation } from "@/services/recommendation";
import { completeTask, createTask, listActiveTasks } from "@/services/tasks";
import { getInProgressSession } from "@/services/sessions";
import { getSetting, setSetting } from "@/services/settings";
import { subjectsRepo } from "@/database/entities";
import type { StudySessionRow, TaskRow } from "@/database/types";

const ONBOARDING_DISMISSED_KEY = "onboarding_dismissed";

function formatDue(iso: string | null): string {
  if (!iso) return "sin fecha";
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "hoy";
  if (diffDays === -1) return "ayer";
  if (diffDays === 1) return "mañana";
  if (diffDays < 0) return `hace ${Math.abs(diffDays)} días`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

const PRIORITY_LABEL: Record<TaskRow["priority"], string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export function TodayPage() {
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [inProgressSession, setInProgressSession] = useState<StudySessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const refresh = useCallback(async () => {
    const [rec, activeTasks, active, subjects, dismissed] = await Promise.all([
      recommendNextAction(),
      listActiveTasks(),
      getInProgressSession(),
      subjectsRepo.list(),
      getSetting<boolean>(ONBOARDING_DISMISSED_KEY),
    ]);
    setRecommendation(rec);
    setTasks(activeTasks);
    setInProgressSession(active);
    setShowOnboarding(subjects.length === 0 && !dismissed);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDismissOnboarding() {
    setShowOnboarding(false);
    await setSetting(ONBOARDING_DISMISSED_KEY, true);
  }

  async function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      await createTask({ title, due_at: new Date().toISOString() });
      setQuickTitle("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleComplete(id: string) {
    await completeTask(id);
    await refresh();
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at) < todayStart);
  const dueToday = tasks.filter(
    (t) => t.due_at && new Date(t.due_at) >= todayStart && new Date(t.due_at).toDateString() === new Date().toDateString(),
  );
  const rest = tasks.filter((t) => !overdue.includes(t) && !dueToday.includes(t));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header
        className="relative overflow-hidden border-b border-border-subtle px-10 py-14"
        style={{
          background:
            "radial-gradient(1200px 400px at 20% -20%, var(--atmosphere-blue), transparent), radial-gradient(900px 400px at 90% 10%, var(--atmosphere-purple), transparent), var(--background-deep)",
        }}
      >
        <SodiacLogo
          variant="symbol"
          size={72}
          decorative
          className="pointer-events-none absolute right-10 top-10 text-text-primary opacity-[0.08]"
        />
        <p className="text-sm text-text-secondary">
          {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-text-primary">
          {loading ? "…" : recommendation?.action}
        </h1>
        {!loading && recommendation && recommendation.reasons.length > 0 && (
          <ul className="mt-3 max-w-xl space-y-1 text-sm text-text-secondary">
            {recommendation.reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="text-accent">·</span>
                {reason}
              </li>
            ))}
          </ul>
        )}
        {inProgressSession ? (
          <Link
            to={`/sesiones/${inProgressSession.id}`}
            className="mt-6 inline-block rounded border border-accent bg-accent/10 px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-accent"
          >
            Continuar sesión interrumpida
          </Link>
        ) : (
          <Link
            to="/sesiones/nueva"
            className="mt-6 inline-block rounded border border-accent px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-accent"
          >
            Iniciar estudio
          </Link>
        )}
      </header>

      <div className="grid gap-8 p-10 md:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {showOnboarding && (
            <section className="flex items-start justify-between gap-4 rounded border border-accent/40 bg-accent/5 p-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">Empezá por acá</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Todavía no importaste la estructura académica institucional (preguntas, materias, temas).
                  Andá a <Link to="/configuracion" className="text-accent underline">Configuración</Link> y usá
                  "Importar estructura institucional" para empezar.
                </p>
              </div>
              <button
                onClick={handleDismissOnboarding}
                aria-label="Descartar aviso de bienvenida"
                className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
              >
                Descartar
              </button>
            </section>
          )}
          {overdue.length > 0 && (
            <TaskGroup title="Vencidas" tasks={overdue} onComplete={handleComplete} tone="danger" />
          )}
          <TaskGroup title="Hoy" tasks={dueToday} onComplete={handleComplete} tone="accent" empty="Nada previsto para hoy." />
          <TaskGroup title="Próximas" tasks={rest} onComplete={handleComplete} empty="No hay más tareas planificadas." />
        </div>

        <aside className="space-y-4">
          <form onSubmit={handleQuickAdd} className="rounded border border-border-subtle bg-surface p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Tarea rápida para hoy
            </label>
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Ej: Leer estados financieros de YPF"
              className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating || !quickTitle.trim()}
              className="mt-2 w-full rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              {creating ? "Creando…" : "Agregar"}
            </button>
          </form>
          <Link
            to="/planificacion"
            className="block rounded border border-border-subtle bg-surface p-4 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            Ver todas las tareas y el calendario →
          </Link>
        </aside>
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  onComplete,
  tone,
  empty,
}: {
  title: string;
  tasks: TaskRow[];
  onComplete: (id: string) => void;
  tone?: "danger" | "accent";
  empty?: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h2>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{empty ?? "—"}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-4 p-3 text-sm">
              <div>
                <span className="text-text-primary">{task.title}</span>{" "}
                <span
                  className={
                    tone === "danger"
                      ? "text-xs text-danger"
                      : tone === "accent"
                        ? "text-xs text-accent"
                        : "text-xs text-text-muted"
                  }
                >
                  · {formatDue(task.due_at)} · {PRIORITY_LABEL[task.priority]}
                </span>
              </div>
              <button
                onClick={() => onComplete(task.id)}
                className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-success hover:text-success"
              >
                Completar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
