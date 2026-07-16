import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CareerData } from "./useCareerData";
import { getSubjectXpBudgetTotal, getSubjectXpTotal } from "@/services/xp";

export function MallaView({ data }: { data: CareerData }) {
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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.subjects.map((subject, i) => {
        const stage = data.stages.find((s) => s.id === subject.learning_stage_id);
        const question = data.questions.find((q) => q.id === subject.fundamental_question_id);
        const topics = data.topics.filter((t) => t.subject_id === subject.id);
        const completedTopics = topics.filter((t) => t.completed_at).length;
        const progressPct = topics.length > 0 ? Math.round((completedTopics / topics.length) * 100) : 0;
        const mainCompetencyId = topics.find((t) => t.competency_id)?.competency_id;
        const mainCompetency = data.competencies.find((c) => c.id === mainCompetencyId);
        const obtained = xpBySubject.get(subject.id) ?? 0;
        const total = budgetBySubject.get(subject.id) ?? 0;

        return (
          <Link
            key={subject.id}
            to={`/carrera/${subject.id}`}
            className="flex flex-col gap-2 rounded border border-border-subtle bg-surface p-4 hover:border-accent"
          >
            <div className="flex items-start justify-between">
              <span className="text-xs text-text-muted">#{i + 1}</span>
              {subject.completed_at ? (
                <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Completada</span>
              ) : (
                <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">{subject.status}</span>
              )}
            </div>
            <h3 className="font-display text-base text-text-primary">{subject.title}</h3>
            <p className="text-xs text-text-muted">{stage?.title ?? "Sin etapa"}</p>
            {question && <p className="text-xs text-text-secondary">Pregunta: {question.title}</p>}
            {mainCompetency && <p className="text-xs text-text-secondary">Competencia: {mainCompetency.title}</p>}

            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{progressPct}% · {completedTopics}/{topics.length} temas</span>
              <span className="text-accent">
                {Math.round(obtained)}/{Math.round(total)} XP
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
