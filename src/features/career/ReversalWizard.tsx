import { useEffect, useState } from "react";
import type { CompletionReversalReason } from "@/database/types";
import { REVERSAL_REASON_LABELS, previewTopicReversal, reverseTopicCompletion } from "@/services/completionReversal";
import type { TopicReversalPreview } from "@/services/completionReversal";

const REASON_OPTIONS = Object.entries(REVERSAL_REASON_LABELS) as [CompletionReversalReason, string][];

/**
 * "Marcar como no completado" — nunca una acción principal. Se llega acá desde
 * un menú secundario ("Más acciones → Corregir estado"), nunca desde un botón
 * junto a "Iniciar estudio". Muestra todo lo que cambiaría antes de confirmar
 * y no borra nada: compensa el XP con un evento negativo, conserva el original.
 */
export function ReversalWizard({
  topicId,
  onClose,
  onReverted,
}: {
  topicId: string;
  onClose: () => void;
  onReverted: () => void;
}) {
  const [preview, setPreview] = useState<TopicReversalPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<CompletionReversalReason>("marcado_por_error");
  const [note, setNote] = useState("");
  const [alsoReverseSubject, setAlsoReverseSubject] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    previewTopicReversal(topicId)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  async function handleConfirm() {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      await reverseTopicCompletion(topicId, {
        reasonCode,
        userNote: note.trim() || null,
        alsoReverseSubject,
      });
      onReverted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const requiresCascadeConfirmation = preview?.subjectWouldBeInconsistent && !alsoReverseSubject;
  const activeAffected = preview?.topicsBackToBlocked.filter((t) => t.hasActivity) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded border border-border bg-surface-elevated p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-text-primary">Marcar como no completado</h3>

        {loading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}

        {!loading && preview?.blockedReason && (
          <>
            <p className="mt-3 text-sm text-danger">{preview.blockedReason}</p>
            <button
              onClick={onClose}
              className="mt-4 rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
            >
              Cerrar
            </button>
          </>
        )}

        {!loading && preview && !preview.blockedReason && (
          <>
            <p className="mt-1 text-sm text-text-secondary">{preview.topic.title}</p>
            {preview.subject && <p className="text-xs text-text-muted">{preview.subject.title}</p>}

            <div className="mt-3 space-y-1.5 rounded border border-border-subtle bg-background/40 p-3 text-xs text-text-secondary">
              <p>
                <span className="text-text-muted">Completado el: </span>
                {preview.completedAt ? new Date(preview.completedAt).toLocaleString("es-AR") : "—"}
              </p>
              {preview.session && (
                <p>
                  <span className="text-text-muted">Sesión relacionada: </span>
                  {preview.session.observable_objective ?? "(sin objetivo registrado)"}
                </p>
              )}
              <p>
                <span className="text-text-muted">XP a compensar: </span>
                {preview.reversibleEvent ? (
                  <span className="text-danger">−{Math.round(preview.xpToReverse * 100) / 100} XP</span>
                ) : (
                  "este tema no tiene XP de finalización asociado"
                )}
              </p>
              {preview.topicsBackToBlocked.length > 0 && (
                <p>
                  <span className="text-text-muted">Volverán a verse bloqueados: </span>
                  {preview.topicsBackToBlocked.length} tema
                  {preview.topicsBackToBlocked.length === 1 ? "" : "s"}
                  {activeAffected.length > 0
                    ? ` (${activeAffected.length} con actividad propia — no se toca nada de ellos)`
                    : ""}
                  . Es solo una etiqueta informativa: no impide iniciar estudio.
                </p>
              )}
            </div>

            {preview.subjectWouldBeInconsistent && (
              <div className="mt-3 rounded border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                <p>
                  La materia <strong>{preview.subject?.title}</strong> ya está cerrada. Revertir sólo este tema la
                  dejaría inconsistente.
                </p>
                <label className="mt-2 flex items-center gap-2 text-text-primary">
                  <input
                    type="checkbox"
                    checked={alsoReverseSubject}
                    onChange={(e) => setAlsoReverseSubject(e.target.checked)}
                  />
                  Revertir también el cierre de la materia
                </label>
              </div>
            )}

            <div className="mt-3">
              <label className="text-xs text-text-muted">Motivo</label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as CompletionReversalReason)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                {REASON_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2">
              <label className="text-xs text-text-muted">Nota (opcional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            {error && <p className="mt-2 text-xs text-danger">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void handleConfirm()}
                disabled={submitting || requiresCascadeConfirmation}
                title={requiresCascadeConfirmation ? "Confirmá la reversión de la materia o cancelá" : undefined}
                className="rounded border border-danger bg-danger/10 px-4 py-2 text-sm uppercase tracking-wide text-danger disabled:opacity-40"
              >
                {submitting ? "Corrigiendo…" : "Confirmar corrección"}
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {!loading && error && !preview && (
          <>
            <p className="mt-3 text-sm text-danger">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
            >
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
