import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core";
import {
  completeTask,
  createTask,
  listAllTasks,
  reopenTask,
  rescheduleTask,
} from "@/services/tasks";
import { subjectsRepo, topicsRepo } from "@/database/entities";
import type { SubjectRow, TaskRow, TopicRow } from "@/database/types";
import { localDateInputToIso } from "@/utils/date";

const PRIORITIES: TaskRow["priority"][] = ["baja", "media", "alta", "critica"];
const PRIORITY_LABEL: Record<TaskRow["priority"], string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
const PRIORITY_COLOR: Record<TaskRow["priority"], string> = {
  critica: "#FF6B72",
  alta: "#E6B85C",
  media: "#00D6C5",
  baja: "#6F7980",
};

export function PlanningPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskRow["priority"]>("media");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const [taskRows, subjectRows, topicRows] = await Promise.all([
      listAllTasks(),
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      topicsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
    ]);
    setTasks(taskRows);
    setSubjects(subjectRows);
    setTopics(topicRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createTask({
        title: trimmed,
        due_at: dueDate ? localDateInputToIso(dueDate) : null,
        priority,
        subject_id: subjectId || null,
        topic_id: topicId || null,
      });
      setTitle("");
      setDueDate("");
      setPriority("media");
      setSubjectId("");
      setTopicId("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  const topicsForSubject = topics.filter((t) => t.subject_id === subjectId);

  async function handleToggle(task: TaskRow) {
    if (task.status === "completada") {
      await reopenTask(task.id);
    } else {
      await completeTask(task.id);
    }
    await refresh();
  }

  async function handleEventDrop(info: EventDropArg) {
    const newDate = info.event.start;
    if (!newDate) return;
    await rescheduleTask(info.event.id, newDate.toISOString(), "Reprogramada arrastrando en el calendario.");
    await refresh();
  }

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    const task = tasks.find((t) => t.id === info.event.id);
    if (task) void handleToggle(task);
  }

  const events = tasks
    .filter((t) => t.due_at)
    .map((t) => ({
      id: t.id,
      title: t.title,
      start: t.due_at!,
      allDay: true,
      color: PRIORITY_COLOR[t.priority],
      classNames: t.status === "completada" ? ["opacity-40", "line-through"] : [],
    }));

  return (
    <div className="h-full space-y-6 overflow-y-auto p-8">
      <h1 className="font-display text-2xl">Planificación</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Tareas y calendario
        </h2>

        <form onSubmit={handleCreate} className="space-y-2 rounded border border-border-subtle bg-surface p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la tarea"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskRow["priority"])}
              className="rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTopicId("");
              }}
              className="flex-1 rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Sin materia</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!subjectId}
              className="flex-1 rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-40"
            >
              <option value="">Sin tema</option>
              {topicsForSubject.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="w-full rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
          >
            {creating ? "Creando…" : "Crear tarea"}
          </button>
        </form>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Todas las tareas
          </h2>
          {loading ? (
            <p className="mt-2 text-sm text-text-muted">Cargando…</p>
          ) : tasks.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">Todavía no hay tareas.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className={task.status === "completada" ? "text-text-muted line-through" : "text-text-primary"}>
                    {task.title}
                    <div className="text-xs text-text-muted">
                      {task.due_at ? new Date(task.due_at).toLocaleDateString("es-AR") : "sin fecha"} ·{" "}
                      {PRIORITY_LABEL[task.priority]}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {task.status !== "completada" && (
                      <Link
                        to={`/sesiones/nueva?${new URLSearchParams({
                          taskId: task.id,
                          objective: task.title,
                          ...(task.subject_id ? { subjectId: task.subject_id } : {}),
                          ...(task.topic_id ? { topicId: task.topic_id } : {}),
                        }).toString()}`}
                        className="rounded border border-accent px-2 py-1 text-xs text-accent"
                      >
                        Iniciar sesión
                      </Link>
                    )}
                    <button
                      onClick={() => handleToggle(task)}
                      className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                    >
                      {task.status === "completada" ? "Reabrir" : "Completar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="sodiac-calendar rounded border border-border-subtle bg-surface p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          locale={esLocale}
          firstDay={1}
          editable
          eventStartEditable
          events={events}
          eventDrop={handleEventDrop}
          eventClick={handleEventClick}
          height="auto"
        />
      </div>
      </div>
    </div>
  );
}
