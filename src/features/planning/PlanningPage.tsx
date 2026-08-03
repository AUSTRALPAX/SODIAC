import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { computeStudyStreak, listContinuityPoints, type ContinuityPointView, type StudyStreak } from "@/services/rhythm";

export function PlanningPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollRestore(scrollRef, "planning");
  const [streak, setStreak] = useState<StudyStreak | null>(null);
  const [continuityPoints, setContinuityPoints] = useState<ContinuityPointView[]>([]);

  const refresh = useCallback(async () => {
    const [streakResult, continuityResult] = await Promise.all([computeStudyStreak(), listContinuityPoints()]);
    setStreak(streakResult);
    setContinuityPoints(continuityResult);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div ref={scrollRef} className="h-full space-y-6 overflow-y-auto p-8">
      <h1 className="font-display text-2xl">Ritmo y continuidad</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Racha de estudio
          </h2>
          {!streak ? (
            <p className="mt-2 text-sm text-text-muted">Cargando…</p>
          ) : streak.currentStreak > 0 ? (
            <p className="mt-2 text-sm text-text-primary">
              {streak.currentStreak === 1 ? "1 día seguido" : `${streak.currentStreak} días seguidos`}
              {streak.longestStreak > streak.currentStreak && ` · récord: ${streak.longestStreak} días`}
            </p>
          ) : (
            <p className="mt-2 text-sm text-text-muted">
              Sin racha activa
              {streak.lastStudyDate &&
                // lastStudyDate es un YYYY-MM-DD puro (de date(started_at) en SQL) — hay
                // que anclarlo a medianoche LOCAL, si no new Date() lo interpreta como UTC
                // y en husos negativos (Argentina, UTC-3) muestra el día anterior.
                ` — la última sesión fue el ${new Date(`${streak.lastStudyDate}T00:00:00`).toLocaleDateString("es-AR")}`}
              {streak.longestStreak > 0 && ` · récord: ${streak.longestStreak} días`}
            </p>
          )}
        </section>

        <section className="rounded border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Puntos de continuidad
          </h2>
          {continuityPoints.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">Todavía no hay puntos de continuidad guardados.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
              {continuityPoints.map((point) => (
                <li key={point.id} className="border-b border-border-subtle pb-2 last:border-0">
                  <p className="text-text-primary">{point.description}</p>
                  <p className="text-xs text-text-muted">
                    {new Date(point.createdAt).toLocaleDateString("es-AR")}
                    {(point.subjectTitle || point.topicTitle || point.projectTitle) &&
                      ` · ${[point.subjectTitle, point.topicTitle, point.projectTitle].filter(Boolean).join(" · ")}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
