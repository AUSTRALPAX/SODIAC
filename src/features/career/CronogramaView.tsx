import { useMemo, useState } from "react";
import type { CareerData } from "./useCareerData";

type RangeMode = "semana" | "mes" | "todo";

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day + 6) % 7; // lunes como inicio
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function CronogramaView({ data }: { data: CareerData }) {
  const [range, setRange] = useState<RangeMode>("semana");
  const today = useMemo(() => new Date(), []);

  const scheduled = useMemo(
    () => data.activities.filter((a): a is typeof a & { scheduled_date: string } => !!a.scheduled_date),
    [data.activities],
  );

  const filtered = useMemo(() => {
    if (range === "todo") return scheduled;
    const from = range === "semana" ? startOfWeek(today) : new Date(today.getFullYear(), today.getMonth(), 1);
    const to =
      range === "semana"
        ? new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
        : new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return scheduled.filter((a) => {
      const d = new Date(`${a.scheduled_date}T00:00:00`);
      return d >= from && d < to;
    });
  }, [scheduled, range, today]);

  const byDate = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const a of filtered) {
      const list = map.get(a.scheduled_date) ?? [];
      list.push(a);
      map.set(a.scheduled_date, list);
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
          <p className="text-sm text-text-muted">No hay actividades programadas en este rango.</p>
        )}
        {byDate.map(([date, activities]) => (
          <div key={date} className="rounded border border-border-subtle bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {new Date(`${date}T00:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <ul className="mt-2 space-y-1">
              {activities.map((a) => {
                const topic = data.topics.find((t) => t.id === a.topic_id);
                const subject = topic ? data.subjects.find((s) => s.id === topic.subject_id) : undefined;
                const question = subject ? data.questions.find((q) => q.id === subject.fundamental_question_id) : undefined;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text-primary">
                      {a.title}
                      <span className="ml-2 text-xs text-text-muted">
                        {subject?.title}
                        {topic ? ` · ${topic.title}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      {question && <span>{question.title}</span>}
                      {a.estimated_minutes && <span>{a.estimated_minutes} min</span>}
                      {a.completed_at && <span className="text-success">Completada</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
