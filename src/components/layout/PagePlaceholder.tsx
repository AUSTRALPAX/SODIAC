/**
 * Marcador explícito de función pendiente (nunca se presenta como terminada —
 * ver prompt maestro §28). Se reemplaza pantalla por pantalla en las fases del roadmap.
 */
export function PagePlaceholder({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <div className="flex h-full flex-col items-start justify-start gap-2 p-10">
      <h1 className="font-display text-2xl">{title}</h1>
      <p className="rounded border border-border-subtle bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-text-muted">
        Pendiente de implementación — {phase}
      </p>
    </div>
  );
}
