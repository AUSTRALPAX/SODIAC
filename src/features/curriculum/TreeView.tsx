import { MasteryBadge } from "./MasteryBadge";
import type { CurriculumData } from "./useCurriculumData";

export function TreeView({ data }: { data: CurriculumData }) {
  return (
    <div className="space-y-2">
      {data.questions.map((question) => {
        const subjects = data.subjects.filter((s) => s.fundamental_question_id === question.id);
        return (
          <details key={question.id} className="rounded border border-border-subtle bg-surface" open>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-primary">
              {question.title}
              <span className="ml-2 text-xs font-normal text-text-muted">
                {subjects.length} materia{subjects.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="space-y-1 border-t border-border-subtle p-3">
              {subjects.length === 0 && (
                <p className="px-2 py-1 text-xs text-text-muted">Sin materias asignadas todavía.</p>
              )}
              {subjects.map((subject) => {
                const topics = data.topics.filter((t) => t.subject_id === subject.id);
                return (
                  <details key={subject.id} className="rounded border border-border-subtle bg-surface-elevated">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                      {subject.title}
                      <span className="ml-2 text-xs text-text-muted">
                        {topics.length} tema{topics.length === 1 ? "" : "s"}
                      </span>
                    </summary>
                    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                      {topics.map((topic) => {
                        const mastery = topic.competency_id
                          ? data.masteryByCompetency.get(topic.competency_id)
                          : undefined;
                        return (
                          <li key={topic.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="text-text-primary">{topic.title}</span>
                            <MasteryBadge level={mastery ? mastery.level : null} />
                          </li>
                        );
                      })}
                      {topics.length === 0 && (
                        <li className="px-3 py-2 text-xs text-text-muted">Sin temas todavía.</li>
                      )}
                    </ul>
                  </details>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
