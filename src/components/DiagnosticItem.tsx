export function DiagnosticItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | undefined;
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text-primary";
  return (
    <div>
      <p className="text-text-muted">{label}</p>
      <p className={`mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
