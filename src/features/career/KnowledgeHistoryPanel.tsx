import { useEffect, useState } from "react";
import {
  KNOWLEDGE_HISTORY_KIND_LABEL,
  getSubjectKnowledgeHistory,
  getTopicKnowledgeHistory,
  type KnowledgeHistoryEntry,
} from "@/services/knowledgeHistory";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function KnowledgeHistoryPanel({ topicId, subjectId }: { topicId?: string; subjectId?: string }) {
  const [entries, setEntries] = useState<KnowledgeHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = topicId ? getTopicKnowledgeHistory(topicId) : subjectId ? getSubjectKnowledgeHistory(subjectId) : Promise.resolve([]);
    void load.then((result) => {
      if (!cancelled) setEntries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [topicId, subjectId]);

  if (entries === null) {
    return <div className="rounded border border-border-subtle bg-surface p-4 text-xs text-text-muted">Cargando historial…</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded border border-border-subtle bg-surface p-4 text-xs text-text-muted">
        Todavía no hay sesiones, notas, validaciones ni XP registrados.
      </div>
    );
  }

  return (
    <div className="rounded border border-border-subtle bg-surface p-3">
      <ul className="space-y-2 text-xs">
        {entries.map((entry) => (
          <li key={`${entry.kind}-${entry.id}`} className="border-l-2 border-border-subtle pl-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-text-primary">{entry.title}</span>
              <span className="shrink-0 text-text-muted">{formatDateTime(entry.occurredAt)}</span>
            </div>
            <p className="text-text-muted">
              {KNOWLEDGE_HISTORY_KIND_LABEL[entry.kind]}
              {entry.detail ? ` — ${entry.detail}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
