import { getDb } from "@/database/client";
import { studySessionsRepo, subjectsRepo, topicsRepo } from "@/database/entities";
import type {
  CompletionReversalReason,
  CompletionReversalRow,
  SubjectRow,
  TopicRow,
  XpEventRow,
} from "@/database/types";
import { listXpEventsForCompletion, pruneLevelHistoryAboveCurrent, reverseXp } from "@/services/xp";

const now = () => new Date().toISOString();

export const REVERSAL_REASON_LABELS: Record<CompletionReversalReason, string> = {
  sesion_prueba: "Fue una sesión de prueba",
  marcado_por_error: "Lo marqué por error",
  contenido_no_estudiado: "El contenido no se estudió realmente",
  evidencia_insuficiente: "La evidencia es insuficiente",
  otro: "Otro motivo",
};

export interface ReversalInput {
  reasonCode: CompletionReversalReason;
  userNote?: string | null;
  /** Requerido para confirmar la cascada cuando la materia también quedaría revertida. */
  alsoReverseSubject?: boolean;
}

export interface AffectedTopic {
  id: string;
  title: string;
  /** Volverá a mostrarse como bloqueado. No se modifica ninguna fila. */
  hasActivity: boolean;
}

export interface TopicReversalPreview {
  topic: TopicRow;
  subject: SubjectRow | null;
  completedAt: string | null;
  /** Sesión que probablemente lo completó, si se pudo determinar. */
  session: { id: string; observable_objective: string | null; ended_at: string | null } | null;
  /** Eventos de la familia: el original, reintentos y reversiones previas. */
  xpEvents: XpEventRow[];
  /** Evento que se compensaría. `null` si el tema se completó antes del pool de XP. */
  reversibleEvent: XpEventRow | null;
  /** XP que se restaría. 0 si no hay evento que revertir. */
  xpToReverse: number;
  /** Temas que volverán a verse bloqueados. Informativo: no se toca ninguno. */
  topicsBackToBlocked: AffectedTopic[];
  /** La materia está cerrada y quedaría inconsistente si se revierte sólo el tema. */
  subjectWouldBeInconsistent: boolean;
  /** Ya fue revertido antes: no se puede revertir de nuevo. */
  alreadyReversed: boolean;
  /** Motivo por el que la reversión no puede proceder, si lo hay. */
  blockedReason: string | null;
}

/**
 * Todo lo que el asistente necesita mostrar antes de que el usuario confirme.
 * No escribe nada.
 */
export async function previewTopicReversal(topicId: string): Promise<TopicReversalPreview> {
  const topic = await topicsRepo.getById(topicId);
  if (!topic) throw new Error("El tema indicado no existe.");

  const subject = topic.subject_id ? await subjectsRepo.getById(topic.subject_id) : null;
  const xpEvents = await listXpEventsForCompletion("topic_completion", topicId, "finalizacion_tema");

  // El evento a compensar es el positivo más reciente que todavía no fue
  // revertido. Los negativos son reversiones previas.
  const reversedIds = new Set(xpEvents.filter((e) => e.reversal_of).map((e) => e.reversal_of));
  const reversibleEvent =
    xpEvents.filter((e) => e.amount > 0 && !reversedIds.has(e.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ??
    null;

  const priorReversals = await listReversals("topic", topicId);

  // Sesión asociada: la última sesión formal sobre este tema.
  const sessions = await studySessionsRepo.list({
    where: "topic_id = ? AND closure_status = 'formal'",
    params: [topicId],
    orderBy: "ended_at DESC",
  });
  const session = sessions[0]
    ? {
        id: sessions[0].id,
        observable_objective: sessions[0].observable_objective,
        ended_at: sessions[0].ended_at,
      }
    : null;

  // Temas de la misma materia que siguen al revertido: su badge "bloqueado" se
  // recalcula en vivo, así que volverán a mostrarse bloqueados. NO se modifican:
  // "bloqueado" es informativo y no impide iniciar una sesión.
  const topicsBackToBlocked = await computeTopicsBackToBlocked(topic);

  const notCompleted = !topic.completed_at;
  const alreadyReversed = reversibleEvent === null && priorReversals.length > 0 && notCompleted;

  let blockedReason: string | null = null;
  if (notCompleted) blockedReason = "El tema no está marcado como completado.";

  return {
    topic,
    subject,
    completedAt: topic.completed_at,
    session,
    xpEvents,
    reversibleEvent,
    xpToReverse: reversibleEvent ? reversibleEvent.amount : 0,
    topicsBackToBlocked,
    subjectWouldBeInconsistent: Boolean(subject?.completed_at),
    alreadyReversed,
    blockedReason,
  };
}

/**
 * Temas que volverán a aparecer bloqueados. Se marca cuáles ya tienen actividad
 * (sesiones o finalización) porque son los casos que al usuario le importa ver
 * antes de confirmar — aunque, insistimos, no se toca ninguno.
 */
async function computeTopicsBackToBlocked(topic: TopicRow): Promise<AffectedTopic[]> {
  if (!topic.subject_id) return [];
  const siblings = await topicsRepo.list({
    where: "subject_id = ? AND archived_at IS NULL AND sort_order > ?",
    params: [topic.subject_id, topic.sort_order],
    orderBy: "sort_order ASC",
  });
  if (siblings.length === 0) return [];

  const db = await getDb();
  const withActivity = await db.select<{ topic_id: string }[]>(
    `SELECT DISTINCT topic_id FROM study_session WHERE topic_id IN (${siblings.map(() => "?").join(",")})`,
    siblings.map((s) => s.id),
  );
  const activeIds = new Set(withActivity.map((r) => r.topic_id));

  return siblings.map((s) => ({
    id: s.id,
    title: s.title,
    hasActivity: activeIds.has(s.id) || Boolean(s.completed_at),
  }));
}

export interface ReverseTopicResult {
  reversal: CompletionReversalRow;
  subjectReversal: CompletionReversalRow | null;
  xpReversed: number;
  purgedLevelHistory: number;
}

/**
 * Marca un tema como no completado compensando el XP con un evento negativo.
 *
 * Lo que NO hace, deliberadamente: no borra el `xp_event` original, no borra ni
 * modifica sesiones, repasos, evidencia ni notas, y no toca los temas que
 * vuelven a verse bloqueados. Revertir la finalización no borra que el estudio
 * ocurrió.
 */
export async function reverseTopicCompletion(
  topicId: string,
  input: ReversalInput,
): Promise<ReverseTopicResult> {
  const preview = await previewTopicReversal(topicId);
  if (preview.blockedReason) throw new Error(preview.blockedReason);

  if (preview.subjectWouldBeInconsistent && !input.alsoReverseSubject) {
    throw new Error(
      "La materia está cerrada: revertir sólo el tema la dejaría inconsistente. " +
        "Confirmá la reversión en cascada o cancelá.",
    );
  }

  const topic = preview.topic;
  const statusBefore = topic.status;
  const completedAtBefore = topic.completed_at;

  // 1. El estado del tema. `activity_log` registra el cambio por sí solo.
  await topicsRepo.update(topicId, { completed_at: null, status: "activo" });

  // 2. El XP compensatorio. El original queda intacto.
  let reversalEvent: XpEventRow | null = null;
  if (preview.reversibleEvent) {
    reversalEvent = await reverseXp(
      preview.reversibleEvent,
      `Reversión de finalización: ${topic.title}`,
      {
        reasonCode: input.reasonCode,
        userNote: input.userNote ?? null,
        reversedEntity: { type: "topic", id: topicId, title: topic.title },
      },
    );
  }

  // 3. La materia, si el usuario confirmó la cascada.
  let subjectReversal: CompletionReversalRow | null = null;
  if (preview.subjectWouldBeInconsistent && input.alsoReverseSubject && preview.subject) {
    subjectReversal = await reverseSubjectCompletion(preview.subject, input);
  }

  // 4. Recién ahora, con todo el XP ya descontado, se purga el historial de
  //    nivel que quedó por encima del nivel real.
  const purgedLevelHistory = await pruneLevelHistoryAboveCurrent();

  // 5. La bitácora.
  const reversal: CompletionReversalRow = {
    id: crypto.randomUUID(),
    entity_type: "topic",
    entity_id: topicId,
    completed_at_before: completedAtBefore,
    status_before: statusBefore,
    reason_code: input.reasonCode,
    user_note: input.userNote?.trim() || null,
    original_xp_event_id: preview.reversibleEvent?.id ?? null,
    reversal_xp_event_id: reversalEvent?.id ?? null,
    study_session_id: preview.session?.id ?? null,
    purged_level_history: purgedLevelHistory,
    reverted_at: now(),
    created_at: now(),
  };
  await insertReversal(reversal);

  return {
    reversal,
    subjectReversal,
    xpReversed: reversalEvent ? Math.abs(reversalEvent.amount) : 0,
    purgedLevelHistory,
  };
}

/**
 * Reversión del cierre de una materia. Se usa tanto en cascada (al revertir un
 * tema de una materia ya cerrada) como por sí sola.
 */
export async function reverseSubjectCompletion(
  subject: SubjectRow,
  input: ReversalInput,
): Promise<CompletionReversalRow> {
  const events = await listXpEventsForCompletion("subject_completion", subject.id, "cierre_materia");
  const reversedIds = new Set(events.filter((e) => e.reversal_of).map((e) => e.reversal_of));
  const original =
    events.filter((e) => e.amount > 0 && !reversedIds.has(e.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ??
    null;

  const statusBefore = subject.status;
  const completedAtBefore = subject.completed_at;

  await subjectsRepo.update(subject.id, { completed_at: null, status: "activa" });

  let reversalEvent: XpEventRow | null = null;
  if (original) {
    reversalEvent = await reverseXp(original, `Reversión de cierre de materia: ${subject.title}`, {
      reasonCode: input.reasonCode,
      userNote: input.userNote ?? null,
      reversedEntity: { type: "subject", id: subject.id, title: subject.title },
    });
  }

  const row: CompletionReversalRow = {
    id: crypto.randomUUID(),
    entity_type: "subject",
    entity_id: subject.id,
    completed_at_before: completedAtBefore,
    status_before: statusBefore,
    reason_code: input.reasonCode,
    user_note: input.userNote?.trim() || null,
    original_xp_event_id: original?.id ?? null,
    reversal_xp_event_id: reversalEvent?.id ?? null,
    study_session_id: null,
    purged_level_history: 0,
    reverted_at: now(),
    created_at: now(),
  };
  await insertReversal(row);
  return row;
}

async function insertReversal(row: CompletionReversalRow): Promise<void> {
  const db = await getDb();
  const columns = Object.keys(row);
  await db.execute(
    `INSERT INTO completion_reversal (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((c) => (row as unknown as Record<string, unknown>)[c]),
  );
}

export async function listReversals(
  entityType?: "topic" | "subject",
  entityId?: string,
): Promise<CompletionReversalRow[]> {
  const db = await getDb();
  if (entityType && entityId) {
    return db.select<CompletionReversalRow[]>(
      "SELECT * FROM completion_reversal WHERE entity_type = ? AND entity_id = ? ORDER BY reverted_at DESC",
      [entityType, entityId],
    );
  }
  return db.select<CompletionReversalRow[]>(
    "SELECT * FROM completion_reversal ORDER BY reverted_at DESC",
  );
}

export interface ReversalHistoryEntry extends CompletionReversalRow {
  entityTitle: string;
  reasonLabel: string;
}

/** Historial de estado, con el título de cada entidad resuelto para mostrar. */
export async function listReversalHistory(): Promise<ReversalHistoryEntry[]> {
  const rows = await listReversals();
  const topics = new Map((await topicsRepo.list()).map((t) => [t.id, t.title]));
  const subjects = new Map((await subjectsRepo.list()).map((s) => [s.id, s.title]));
  return rows.map((r) => ({
    ...r,
    entityTitle:
      (r.entity_type === "topic" ? topics.get(r.entity_id) : subjects.get(r.entity_id)) ??
      "(elemento eliminado)",
    reasonLabel: REVERSAL_REASON_LABELS[r.reason_code],
  }));
}
