import type { CareerData } from "./useCareerData";

export function TemarioView({ data }: { data: CareerData }) {
  return (
    <div className="space-y-2">
      {data.subjects.map((subject) => {
        const units = data.units.filter((u) => u.subject_id === subject.id);
        const topicsWithoutUnit = data.topics.filter((t) => t.subject_id === subject.id && !t.curriculum_unit_id);

        return (
          <details key={subject.id} className="rounded border border-border-subtle bg-surface">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-primary">
              {subject.title}
              <span className="ml-2 text-xs font-normal text-text-muted">
                {units.length} unidad{units.length === 1 ? "" : "es"}
              </span>
            </summary>
            <div className="space-y-1 border-t border-border-subtle p-3">
              {units.length === 0 && topicsWithoutUnit.length === 0 && (
                <p className="px-2 py-1 text-xs text-text-muted">Sin unidades ni temas todavía.</p>
              )}
              {units.map((unit) => {
                const topics = data.topics.filter((t) => t.curriculum_unit_id === unit.id);
                return (
                  <details key={unit.id} className="rounded border border-border-subtle bg-surface-elevated">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                      {unit.title}
                      <span className="ml-2 text-xs text-text-muted">
                        {topics.length} tema{topics.length === 1 ? "" : "s"}
                        {unit.budgeted_xp != null ? ` · ${unit.budgeted_xp} XP` : ""}
                      </span>
                    </summary>
                    <TopicList topics={topics} activities={data.activities} />
                  </details>
                );
              })}
              {topicsWithoutUnit.length > 0 && (
                <details className="rounded border border-border-subtle bg-surface-elevated" open>
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                    Temas sin unidad asignada
                    <span className="ml-2 text-xs text-text-muted">{topicsWithoutUnit.length}</span>
                  </summary>
                  <TopicList topics={topicsWithoutUnit} activities={data.activities} />
                </details>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function TopicList({ topics, activities }: { topics: CareerData["topics"]; activities: CareerData["activities"] }) {
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {topics.map((topic) => {
        const topicActivities = activities.filter((a) => a.topic_id === topic.id);
        return (
          <li key={topic.id} className="px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text-primary">{topic.title}</span>
              {topic.completed_at ? (
                <span className="text-xs text-success">Completado</span>
              ) : (
                <span className="text-xs text-text-muted">Pendiente</span>
              )}
            </div>
            {topicActivities.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-3 text-xs text-text-muted">
                {topicActivities.map((a) => (
                  <li key={a.id}>
                    · {a.title}
                    {a.scheduled_date ? ` — ${a.scheduled_date}` : ""}
                    {a.estimated_minutes ? ` (${a.estimated_minutes} min)` : ""}
                    {a.completed_at ? " ✓" : ""}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      {topics.length === 0 && <li className="px-3 py-2 text-xs text-text-muted">Sin temas todavía.</li>}
    </ul>
  );
}
