import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useViewPreference } from "@/hooks/useViewPreference";
import { REVIEWS_VIEW_DEFAULTS, reviewsViewPreferenceSchema } from "@/schemas/viewPreferences";
import {
  completeReview,
  listReviewQueue,
  markReviewCooled,
  markReviewUnnecessary,
  postponeReview,
  reactivateReview,
  type ReviewWithContext,
} from "@/services/reviews";
import type { ReviewRow } from "@/database/types";
import { localDateInputToIso } from "@/utils/date";

const STATE_LABEL: Record<ReviewRow["state"], string> = {
  no_programado: "Sin programar",
  proximo: "Próximo",
  pendiente: "Pendiente",
  vencido: "Vencido",
  completado: "Completado",
  pospuesto: "Pospuesto",
  innecesario: "Innecesario",
  enfriado: "Enfriado",
};

const STATE_COLOR: Record<ReviewRow["state"], string> = {
  no_programado: "text-text-muted",
  proximo: "text-accent",
  pendiente: "text-text-secondary",
  vencido: "text-danger",
  completado: "text-success",
  pospuesto: "text-warning",
  innecesario: "text-text-muted",
  enfriado: "text-text-muted",
};

export function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [postponeTarget, setPostponeTarget] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState("");
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference(
    "reviews",
    reviewsViewPreferenceSchema,
    REVIEWS_VIEW_DEFAULTS,
  );
  const { showHistory } = viewPrefs;

  const refresh = useCallback(async () => {
    setReviews(await listReviewQueue());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleComplete(id: string) {
    await completeReview(id);
    await refresh();
  }

  async function handleUnnecessary(id: string) {
    await markReviewUnnecessary(id);
    await refresh();
  }

  async function handleCooled(id: string) {
    await markReviewCooled(id);
    await refresh();
  }

  async function handleReactivate(id: string) {
    await reactivateReview(id, new Date().toISOString());
    await refresh();
  }

  async function handleConfirmPostpone() {
    if (!postponeTarget || !postponeDate) return;
    await postponeReview(postponeTarget, localDateInputToIso(postponeDate));
    setPostponeTarget(null);
    setPostponeDate("");
    await refresh();
  }

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  const vencidos = reviews.filter((r) => r.displayState === "vencido");
  const proximos = reviews.filter((r) => r.displayState === "proximo" || r.displayState === "pendiente");
  const sinProgramar = reviews.filter((r) => r.displayState === "no_programado");
  const historial = reviews.filter((r) => ["completado", "pospuesto", "innecesario", "enfriado"].includes(r.displayState));

  return (
    <div className="mx-auto max-w-2xl p-10">
      <h1 className="font-display text-2xl">Repasos</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Cada repaso muestra por qué se sugiere. Podés posponerlo, marcarlo innecesario o dejarlo enfriar.
      </p>

      {reviews.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          Todavía no hay repasos. Se programan al finalizar una sesión de estudio.
        </p>
      ) : (
        <>
          <ReviewGroup title="Vencidos" items={vencidos} onComplete={handleComplete} onPostpone={setPostponeTarget} onUnnecessary={handleUnnecessary} onCooled={handleCooled} />
          <ReviewGroup title="Próximos" items={proximos} onComplete={handleComplete} onPostpone={setPostponeTarget} onUnnecessary={handleUnnecessary} onCooled={handleCooled} />
          <ReviewGroup title="Sin programar" items={sinProgramar} onComplete={handleComplete} onPostpone={setPostponeTarget} onUnnecessary={handleUnnecessary} onCooled={handleCooled} />

          {historial.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => updateViewPrefs({ showHistory: !showHistory }, { immediate: true })}
                className="text-xs uppercase tracking-wide text-text-muted hover:text-text-secondary"
              >
                {showHistory ? "Ocultar" : "Ver"} historial ({historial.length})
              </button>
              {showHistory && (
                <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
                  {historial.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div>
                        <span className="text-text-primary">{r.label}</span>{" "}
                        <span className={`text-xs ${STATE_COLOR[r.displayState]}`}>· {STATE_LABEL[r.displayState]}</span>
                      </div>
                      <button
                        onClick={() => handleReactivate(r.id)}
                        className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                      >
                        Reactivar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {postponeTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8" onClick={() => setPostponeTarget(null)}>
          <div className="w-full max-w-sm rounded border border-border bg-surface-elevated p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg">Posponer repaso</h3>
            <input
              type="date"
              value={postponeDate}
              onChange={(e) => setPostponeDate(e.target.value)}
              className="mt-3 w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleConfirmPostpone}
              disabled={!postponeDate}
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

function ReviewGroup({
  title,
  items,
  onComplete,
  onPostpone,
  onUnnecessary,
  onCooled,
}: {
  title: string;
  items: ReviewWithContext[];
  onComplete: (id: string) => void;
  onPostpone: (id: string) => void;
  onUnnecessary: (id: string) => void;
  onCooled: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
        {title} ({items.length})
      </h2>
      <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
        {items.map((r) => (
          <li key={r.id} className="p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-text-primary">{r.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {r.reasons.map((reason) => (
                    <li key={reason} className="text-xs text-text-muted">
                      · {reason}
                    </li>
                  ))}
                </ul>
              </div>
              <span className={`shrink-0 text-xs uppercase tracking-wide ${STATE_COLOR[r.displayState]}`}>
                {STATE_LABEL[r.displayState]}
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <Link
                to={`/sesiones/nueva?${new URLSearchParams({
                  ...(r.topic_id ? { topicId: r.topic_id } : {}),
                  ...(r.competency_id ? { competencyId: r.competency_id } : {}),
                  objective: `Repasar: ${r.label}`,
                }).toString()}`}
                className="rounded border border-accent px-2 py-1 text-xs text-accent"
              >
                Iniciar sesión
              </Link>
              <button onClick={() => onComplete(r.id)} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-success hover:text-success">
                Completar
              </button>
              <button onClick={() => onPostpone(r.id)} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-warning hover:text-warning">
                Posponer
              </button>
              <button onClick={() => onUnnecessary(r.id)} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent">
                Innecesario
              </button>
              <button onClick={() => onCooled(r.id)} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent">
                Enfriar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
