import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CareerData } from "./useCareerData";
import { getSubjectXpBudgetTotal, getSubjectXpTotal } from "@/services/xp";

export function RecorridoView({ data }: { data: CareerData }) {
  const [xpBySubject, setXpBySubject] = useState<Map<string, number>>(new Map());
  const [budgetBySubject, setBudgetBySubject] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    void Promise.all(data.subjects.map((s) => getSubjectXpTotal(s.id).then((xp) => [s.id, xp] as const))).then((entries) => {
      setXpBySubject(new Map(entries));
    });
    void Promise.all(data.subjects.map((s) => getSubjectXpBudgetTotal(s.id).then((b) => [s.id, b.total] as const))).then((entries) => {
      setBudgetBySubject(new Map(entries));
    });
  }, [data.subjects]);

  const stagesWithNull = [...data.stages, null];

  return (
    <div className="space-y-4">
      {stagesWithNull.map((stage) => {
        const subjects = data.subjects.filter((s) => (stage ? s.learning_stage_id === stage.id : !s.learning_stage_id));
        if (subjects.length === 0) return null;
        return (
          <section key={stage?.id ?? "sin_etapa"} className="rounded border border-border-subtle bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg text-text-primary">{stage?.title ?? "Sin etapa asignada"}</h2>
              {stage?.orientative_duration && <span className="text-xs text-text-muted">{stage.orientative_duration}</span>}
            </div>
            {stage?.main_product && <p className="mt-1 text-xs text-text-muted">Producto principal: {stage.main_product}</p>}

            <ol className="mt-3 space-y-2">
              {subjects.map((subject, i) => {
                const topics = data.topics.filter((t) => t.subject_id === subject.id);
                const completedTopics = topics.filter((t) => t.completed_at).length;
                const progressPct = topics.length > 0 ? Math.round((completedTopics / topics.length) * 100) : 0;
                const obtained = xpBySubject.get(subject.id) ?? 0;
                const total = budgetBySubject.get(subject.id) ?? 0;
                return (
                  <li key={subject.id}>
                    <Link
                      to={`/carrera/${subject.id}`}
                      className="flex items-center justify-between gap-3 rounded border border-border-subtle bg-surface-elevated px-3 py-2 hover:border-accent"
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-text-muted">{i + 1}.</span>
                        <span className="text-sm text-text-primary">{subject.title}</span>
                        {subject.completed_at && <span className="text-xs text-success">Completada</span>}
                      </span>
                      <span className="flex items-center gap-3 text-xs text-text-muted">
                        <span>
                          {completedTopics}/{topics.length} temas · {progressPct}%
                        </span>
                        <span className="text-accent">
                          {Math.round(obtained)}/{Math.round(total)} XP
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
