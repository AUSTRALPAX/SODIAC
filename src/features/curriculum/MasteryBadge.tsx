import { MASTERY_LEVEL_COLOR, MASTERY_LEVEL_LABEL } from "@/services/mastery";

export function MasteryBadge({ level }: { level: number | null }) {
  if (level === null) {
    return (
      <span className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
        sin evaluar
      </span>
    );
  }
  return (
    <span
      title={MASTERY_LEVEL_LABEL[level]}
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: MASTERY_LEVEL_COLOR[level], border: `1px solid ${MASTERY_LEVEL_COLOR[level]}` }}
    >
      N{level}
    </span>
  );
}
