import { useEffect, useMemo, useState } from "react";
import { listAllTasks } from "@/services/tasks";
import type { TaskRow } from "@/database/types";
import type { CareerData } from "./useCareerData";

type RangeMode = "semana" | "mes" | "todo";

interface DayEntry {
  id: string;
  kind: "actividad" | "tarea";
  date: string;
  title: string;
  subtitle: string;
  extra: string | null;
  completed: boolean;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day + 6) % 7; // lunes como inicio
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Cronograma une, en una sola vista de calendario, las actividades
 * curriculares (`curriculum_activity`, con fecha propia) y las tareas de
 * Planificación que tengan `due_at` — sin fusionar ambas tablas, para que
 * "qué tenés que estudiar hoy" se vea en un solo lugar sin importar dónde
 * se haya cargado.
 */
export function CronogramaView({ data }: { data: CareerData }) {
  const [range, setRange] = useState<RangeMode>("semana");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    void listAllTasks().then(setTasks);
  }, []);

  const entries = useMemo<DayEntry[]>(() => {
    const activityEntries: DayEntry[] = data.activities
      .filter((a): a is typeof a & { scheduled_date: string } => !!a.scheduled_date)
      .map((a) => {
        const topic = data.topics.find((t) => t.id === a.topic_id);
        const subject = topic ? data.subjects.find((s) => s.id === topic.subject_id) : undefined;
        return {
          id: a.id,
          kind: "actividad",
          date: a.scheduled_date,
          title: a.title,
          subtitle: [subject?.title, topic?.title].filter(Boolean).join(" · "),
          extra: a.estimated_minutes ? `${a.estimated_minutes} min` : null,
          completed: !!a.completed_at,
        };
      });

    const taskEntries: DayEntry[] = tasks
      .filter((t): t is TaskRow & { due_at: string } => !!t.due_at)
      .map((t) => {
        const subject = t.subject_id ? data.subjects.find((s) => s.id === t.subject_id) : undefined;
        const topic = t.topic_id ? data.topics.find((tp) => tp.id === t.topic_id) : undefined;
        return {
          id: t.id,
          kind: "tarea",
          date: t.due_at.slice(0, 10),
          title: t.title,
          subtitle: [subject?.title, topic?.title].filter(Boolean).join(" · "),
          extra: null,
          completed: t.status === "completada",
        };
      });

    return [...activityEntries, ...taskEntries];
  }, [data.activities, data.topics, data.subjects, tasks]);

  const filtered = useMemo(() => {
    if (range === "todo") return entries;
    const from = range === "semana" ? startOfWeek(today) : new Date(today.getFullYear(), today.getMonth(), 1);
    const to =
      range === "semana"
        ? new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
        : new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return entries.filter((e) => {
      const d = new Date(`${e.date}T00:00:00`);
      return d >= from && d < to;
    });
  }, [entries, range, today]);

  const byDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      <div className="flex gap-1 rounded border border-border-subtle bg-surface p-1 w-fit">
        {(["semana", "mes", "todo"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setRange(mode)}
            className={`rounded px-3 py-1 text-xs uppercase tracking-wide ${
              range === mode ? "bg-surface-elevated text-accent" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {mode === "semana" ? "Semana" : mode === "mes" ? "Mes" : "Plan completo"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {byDate.length === 0 && (
          <p className="text-sm text-text-muted">No hay actividades ni tareas programadas en este rango.</p>
        )}
        {byDate.map(([date, dayEntries]) => (
          <div key={date} className="rounded border border-border-subtle bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {new Date(`${date}T00:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <ul className="mt-2 space-y-1">
              {dayEntries.map((e) => (
                <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text-primary">
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        e.kind === "tarea" ? "bg-border-subtle text-text-secondary" : "bg-accent/10 text-accent"
                      }`}
                    >
                      {e.kind}
                    </span>
                    {e.title}
                    {e.subtitle && <span className="ml-2 text-xs text-text-muted">{e.subtitle}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-text-muted">
                    {e.extra && <span>{e.extra}</span>}
                    {e.completed && <span className="text-success">Completada</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
