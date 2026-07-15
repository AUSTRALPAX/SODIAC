import { listActiveTasks } from "@/services/tasks";
import type { TaskRow } from "@/database/types";

/**
 * Motor de recomendación de "próxima acción" (docs/ARCHITECTURE.md §4).
 * Debe ser siempre explicable: la salida incluye las razones en lenguaje
 * natural, nunca una caja negra (prompt maestro §7).
 *
 * En esta fase solo existen `Task` como señal real. Cuando existan
 * StudySession, Review y MasteryAssessment (Fases 4 y 8), sus factores se
 * suman aquí sin cambiar la forma de la salida.
 */
export interface Recommendation {
  action: string;
  reasons: string[];
  relatedTaskId?: string;
}

const PRIORITY_WEIGHT: Record<TaskRow["priority"], number> = {
  critica: 3,
  alta: 2,
  media: 1,
  baja: 0,
};

function byPriorityThenDueDate(a: TaskRow, b: TaskRow): number {
  const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
  if (weightDiff !== 0) return weightDiff;
  if (!a.due_at) return 1;
  if (!b.due_at) return -1;
  return a.due_at.localeCompare(b.due_at);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function recommendNextAction(): Promise<Recommendation> {
  const tasks = await listActiveTasks();
  const now = new Date();
  const todayEnd = endOfToday();
  const todayStart = startOfToday();

  const overdue = tasks
    .filter((t) => t.due_at && new Date(t.due_at) < todayStart)
    .sort(byPriorityThenDueDate);

  if (overdue.length > 0) {
    const task = overdue[0]!;
    return {
      action: `Resolver: "${task.title}"`,
      relatedTaskId: task.id,
      reasons: [
        `Está vencida desde el ${new Date(task.due_at!).toLocaleDateString("es-AR")}.`,
        `Prioridad declarada: ${task.priority}.`,
        overdue.length > 1 ? `Hay ${overdue.length} tareas vencidas en total.` : "Es la única tarea vencida.",
      ],
    };
  }

  const dueToday = tasks
    .filter((t) => t.due_at && new Date(t.due_at) >= todayStart && new Date(t.due_at) <= todayEnd)
    .sort(byPriorityThenDueDate);

  if (dueToday.length > 0) {
    const task = dueToday[0]!;
    return {
      action: `Trabajar en: "${task.title}"`,
      relatedTaskId: task.id,
      reasons: [
        "Vence hoy.",
        `Prioridad declarada: ${task.priority}.`,
      ],
    };
  }

  const upcoming = tasks
    .filter((t) => t.due_at && new Date(t.due_at) > todayEnd)
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!));

  if (upcoming.length > 0) {
    const task = upcoming[0]!;
    const days = Math.ceil((new Date(task.due_at!).getTime() - now.getTime()) / 86_400_000);
    return {
      action: `Adelantar: "${task.title}"`,
      relatedTaskId: task.id,
      reasons: [
        `Es la próxima tarea programada (vence en ${days} día${days === 1 ? "" : "s"}).`,
        "No hay nada vencido ni previsto para hoy.",
      ],
    };
  }

  return {
    action: "Planificar el próximo paso",
    reasons: [
      "No hay tareas pendientes registradas todavía.",
      "Importá la estructura institucional o creá una tarea desde Planificación para activar esta recomendación.",
    ],
  };
}
