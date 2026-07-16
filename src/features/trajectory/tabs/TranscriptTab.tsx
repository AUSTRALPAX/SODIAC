import { useEffect, useMemo, useState } from "react";
import { academicTranscriptEntriesRepo, subjectsRepo } from "@/database/entities";
import {
  buildTranscriptPrintableHtml,
  exportTranscriptCsv,
  exportTranscriptJson,
  exportTranscriptMarkdown,
} from "@/services/transcript";
import type { TranscriptFilters } from "@/services/transcript";
import type { AcademicTranscriptEntryRow, SubjectRow } from "@/database/types";

const VERDICT_LABEL: Record<string, string> = {
  revision_required: "Revisión necesaria",
  basic: "Básico",
  competent: "Competente",
  advanced: "Avanzado",
  outstanding: "Sobresaliente",
};

const VERDICT_COLOR: Record<string, string> = {
  revision_required: "text-danger",
  basic: "text-warning",
  competent: "text-text-primary",
  advanced: "text-accent",
  outstanding: "text-success",
};

export function TranscriptTab() {
  const [entries, setEntries] = useState<AcademicTranscriptEntryRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"vigente" | "todas">("vigente");

  useEffect(() => {
    void Promise.all([academicTranscriptEntriesRepo.list({ orderBy: "recorded_at DESC" }), subjectsRepo.list()]).then(
      ([e, s]) => {
        setEntries(e);
        setSubjects(s);
      },
    );
  }, []);

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => !subjectFilter || e.subject_id === subjectFilter)
        .filter((e) => statusFilter === "todas" || e.status === "vigente"),
    [entries, subjectFilter, statusFilter],
  );

  const subjectTitle = (id: string | null) => subjects.find((s) => s.id === id)?.title ?? "—";

  const currentFilters = useMemo<TranscriptFilters>(
    () => (subjectFilter ? { subjectId: subjectFilter, status: statusFilter } : { status: statusFilter }),
    [subjectFilter, statusFilter],
  );

  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (kind: "json" | "md" | "csv" | "pdf") => {
    setExportError(null);
    try {
      if (kind === "json") {
        await exportTranscriptJson(currentFilters);
      } else if (kind === "md") {
        await exportTranscriptMarkdown(currentFilters);
      } else if (kind === "csv") {
        await exportTranscriptCsv(currentFilters);
      } else {
        const html = await buildTranscriptPrintableHtml(currentFilters);
        const win = window.open("", "_blank");
        if (!win) {
          setExportError("El navegador bloqueó la ventana de impresión. Habilitá las ventanas emergentes e intentá de nuevo.");
          return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        win.print();
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "No se pudo exportar el expediente.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Todas las materias</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "vigente" | "todas")}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="vigente">Solo vigentes</option>
          <option value="todas">Historial completo</option>
        </select>
        <span className="text-xs text-text-muted">{filtered.length} registros</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleExport("json")}
            className="rounded border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-text-primary"
          >
            Exportar JSON
          </button>
          <button
            type="button"
            onClick={() => void handleExport("md")}
            className="rounded border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-text-primary"
          >
            Exportar Markdown
          </button>
          <button
            type="button"
            onClick={() => void handleExport("csv")}
            className="rounded border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-text-primary"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => void handleExport("pdf")}
            className="rounded border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent hover:text-background"
          >
            Vista imprimible (PDF)
          </button>
        </div>
      </div>
      {exportError && <p className="mt-2 text-xs text-danger">{exportError}</p>}

      <div className="mt-4 overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Trabajo</th>
              <th className="px-3 py-2">Materia</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2">Veredicto</th>
              <th className="px-3 py-2">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-text-muted">
                  Todavía no hay trabajos evaluados en el expediente.
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 text-text-primary">
                  {e.title}
                  {e.status !== "vigente" && <span className="ml-1 text-xs text-text-muted">({e.status})</span>}
                </td>
                <td className="px-3 py-2 text-text-secondary">{subjectTitle(e.subject_id)}</td>
                <td className="px-3 py-2 text-text-secondary">{e.work_type.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-text-primary">
                  {e.score_100}/100 · {e.score_10.toFixed(1)}/10
                </td>
                <td className={`px-3 py-2 ${VERDICT_COLOR[e.verdict] ?? "text-text-secondary"}`}>
                  {VERDICT_LABEL[e.verdict] ?? e.verdict}
                </td>
                <td className="px-3 py-2 text-text-muted">{new Date(e.recorded_at).toLocaleDateString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
