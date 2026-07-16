import { useEffect, useState } from "react";
import { academicTranscriptEntriesRepo, subjectAssessmentPlansRepo } from "@/database/entities";
import { listXpHistory } from "@/services/xp";
import type { AcademicRankRow, XpEventRow } from "@/database/types";
import type { LevelProgress } from "@/services/xp";

export function SummaryTab({
  levelProgress,
  currentRank,
}: {
  levelProgress: LevelProgress;
  currentRank: AcademicRankRow | null;
}) {
  const [completedSubjects, setCompletedSubjects] = useState(0);
  const [activeSubjects, setActiveSubjects] = useState(0);
  const [average10, setAverage10] = useState<number | null>(null);
  const [recentXp, setRecentXp] = useState<XpEventRow[]>([]);

  useEffect(() => {
    void (async () => {
      const plans = await subjectAssessmentPlansRepo.list();
      setCompletedSubjects(plans.filter((p) => p.status === "completada" || p.status === "completada_con_revision_pendiente").length);
      setActiveSubjects(plans.filter((p) => ["exploracion", "cursando", "evaluacion", "revision"].includes(p.status)).length);

      const entries = await academicTranscriptEntriesRepo.list({ where: "status = 'vigente'" });
      setAverage10(entries.length > 0 ? entries.reduce((sum, e) => sum + e.score_10, 0) / entries.length : null);

      setRecentXp(await listXpHistory(5));
    })();
  }, []);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded border border-border-subtle bg-surface p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Estado general</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-text-muted">Materias completadas</dt>
            <dd className="font-display text-xl text-text-primary">{completedSubjects}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Materias activas</dt>
            <dd className="font-display text-xl text-text-primary">{activeSubjects}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Promedio académico</dt>
            <dd className="font-display text-xl text-text-primary">{average10 != null ? average10.toFixed(1) : "—"} / 10</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Rango actual</dt>
            <dd className="text-sm text-text-primary">{currentRank?.name ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded border border-border-subtle bg-surface p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Experiencia obtenida recientemente</h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          {recentXp.length === 0 && <li className="text-xs text-text-muted">Todavía no hay experiencia registrada.</li>}
          {recentXp.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-text-secondary">{e.reason}</span>
              <span className="shrink-0 text-accent">+{Math.round(e.amount)} XP</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded border border-border-subtle bg-surface p-4 md:col-span-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Requisitos pendientes para nivel 100</h3>
        <ul className="mt-2 space-y-1 text-xs text-text-secondary">
          <li>· Alcanzar 100.000 XP acumulados (nivel actual: {levelProgress.level}/100).</li>
          <li>· Todas las materias obligatorias completadas.</li>
          <li>· Proyecto final integrador aceptado.</li>
          <li>· Sin requisitos académicos críticos pendientes.</li>
        </ul>
      </div>
    </div>
  );
}
