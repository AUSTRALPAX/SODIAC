import { useState } from "react";
import { completeTopic, previewTopicCompletion } from "@/services/completionXp";
import { computeTopicLearningState } from "@/services/learningState";
import { TopicStateBadge } from "@/components/TopicStateBadge";
import type { TopicRow } from "@/database/types";
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
                    <TopicList topics={topics} activities={data.activities} onReload={data.reload} />
                  </details>
                );
              })}
              {topicsWithoutUnit.length > 0 && (
                <details className="rounded border border-border-subtle bg-surface-elevated" open>
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary">
                    Temas sin unidad asignada
                    <span className="ml-2 text-xs text-text-muted">{topicsWithoutUnit.length}</span>
                  </summary>
                  <TopicList topics={topicsWithoutUnit} activities={data.activities} onReload={data.reload} />
                </details>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function TopicList({
  topics,
  activities,
  onReload,
}: {
  topics: CareerData["topics"];
  activities: CareerData["activities"];
  onReload: () => void;
}) {
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {topics.map((topic) => {
        const topicActivities = activities.filter((a) => a.topic_id === topic.id);
        return (
          <li key={topic.id} className="px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text-primary">{topic.title}</span>
              {topic.completed_at ? (
                <TopicStateBadge state={computeTopicLearningState({ completedAt: topic.completed_at })} />
              ) : (
                <TopicCompleteControl topic={topic} onReload={onReload} />
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

function TopicCompleteControl({ topic, onReload }: { topic: TopicRow; onReload: () => void }) {
  const [xpPreview, setXpPreview] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [completing, setCompleting] = useState(false);

  async function handleShowPreview() {
    setLoadingPreview(true);
    try {
      const preview = await previewTopicCompletion(topic);
      setXpPreview(preview.amount);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirm() {
    setCompleting(true);
    try {
      await completeTopic(topic.id);
      onReload();
    } finally {
      setCompleting(false);
    }
  }

  if (xpPreview != null) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-accent">+{Math.round(xpPreview)} XP</span>
        <button
          onClick={() => void handleConfirm()}
          disabled={completing}
          className="rounded border border-accent px-2 py-0.5 uppercase tracking-wide text-accent disabled:opacity-40"
        >
          {completing ? "Marcando…" : "Confirmar"}
        </button>
        <button onClick={() => setXpPreview(null)} className="text-text-muted hover:text-text-primary">
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => void handleShowPreview()}
      disabled={loadingPreview}
      className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
    >
      {loadingPreview ? "…" : "Marcar completado"}
    </button>
  );
}
