import { useCallback, useEffect, useState, type FormEvent } from "react";
import { subjectsRepo } from "@/database/entities";
import { createAssignment, listAssignments, listSubmissions, submitWork } from "@/services/assignments";
import { listRubrics } from "@/services/rubrics";
import {
  acceptEvaluation,
  EVALUATION_DISCLAIMER,
  generateEvaluationPackage,
  getCriterionEvaluations,
  importEvaluationResponse,
  listEvaluationsForAssignment,
  requestRevision,
} from "@/services/evaluations";
import type {
  AcademicAssignmentRow,
  AcademicEvaluationRow,
  AssignmentSubmissionRow,
  CriterionEvaluationRow,
  SubjectRow,
} from "@/database/types";
import type { RubricWithVersion } from "@/services/rubrics";

const WORK_TYPES = [
  "nota_conceptual",
  "resumen_critico",
  "ejercicio",
  "problema",
  "examen",
  "ensayo",
  "analisis_empresarial",
  "analisis_economico",
  "simulacion",
  "estudio_de_caso",
  "modelo",
  "planilla",
  "presentacion",
  "defensa",
  "proyecto",
  "producto_integrador",
  "capitulo",
  "protocolo",
  "trabajo_libre",
];

export function GradingTab({ onXpAwarded }: { onXpAwarded: () => void }) {
  const [assignments, setAssignments] = useState<AcademicAssignmentRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [rubrics, setRubrics] = useState<RubricWithVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState("");
  const [workType, setWorkType] = useState(WORK_TYPES[0]!);
  const [subjectId, setSubjectId] = useState("");
  const [rubricVersionId, setRubricVersionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const [a, s, r] = await Promise.all([listAssignments(), subjectsRepo.list({ where: "archived_at IS NULL" }), listRubrics()]);
    setAssignments(a);
    setSubjects(s);
    setRubrics(r);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !rubricVersionId) return;
    setCreating(true);
    try {
      const assignment = await createAssignment({
        title: title.trim(),
        workType,
        subjectId: subjectId || null,
        rubricVersionId,
        prompt: prompt || null,
      });
      setTitle("");
      setPrompt("");
      setShowCreate(false);
      await refresh();
      setSelectedId(assignment.id);
    } finally {
      setCreating(false);
    }
  }

  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Trabajos</h3>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded border border-accent px-2 py-1 text-xs uppercase tracking-wide text-accent"
          >
            Nuevo
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="mt-3 space-y-2 rounded border border-border-subtle bg-surface p-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del trabajo"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <select
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {WORK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Sin materia</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <select
              value={rubricVersionId}
              onChange={(e) => setRubricVersionId(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              required
            >
              <option value="">Elegir rúbrica…</option>
              {rubrics.map((r) => (
                <option key={r.id} value={r.currentVersion?.id ?? ""}>
                  {r.title} ({r.currentVersion?.version_label})
                </option>
              ))}
            </select>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Consigna"
              rows={3}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating || !title.trim() || !rubricVersionId}
              className="w-full rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              {creating ? "Creando…" : "Crear trabajo"}
            </button>
          </form>
        )}

        <ul className="mt-3 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {assignments.length === 0 && <li className="p-3 text-sm text-text-muted">Sin trabajos todavía.</li>}
          {assignments.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setSelectedId(a.id)}
                className={`block w-full px-3 py-2.5 text-left text-sm ${
                  selectedId === a.id ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:bg-surface-hover"
                }`}
              >
                {a.title}
                <div className="mt-0.5 text-xs text-text-muted">
                  {a.work_type.replace(/_/g, " ")} · {a.status.replace(/_/g, " ")}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {!selected ? (
          <p className="text-sm text-text-muted">Elegí un trabajo para entregarlo o evaluarlo.</p>
        ) : (
          <AssignmentDetail assignment={selected} onXpAwarded={onXpAwarded} onChanged={refresh} />
        )}
      </div>
    </div>
  );
}

function AssignmentDetail({
  assignment,
  onXpAwarded,
  onChanged,
}: {
  assignment: AcademicAssignmentRow;
  onXpAwarded: () => void;
  onChanged: () => void;
}) {
  const [submissions, setSubmissions] = useState<AssignmentSubmissionRow[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [packageText, setPackageText] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<AcademicEvaluationRow[]>([]);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationNote, setCalibrationNote] = useState<string | null>(null);
  const [criteriaByEvaluation, setCriteriaByEvaluation] = useState<Record<string, CriterionEvaluationRow[]>>({});

  const refresh = useCallback(async () => {
    const subs = await listSubmissions(assignment.id);
    setSubmissions(subs);
    const evals = await listEvaluationsForAssignment(assignment.id);
    setEvaluations(evals);
    const criteriaMap: Record<string, CriterionEvaluationRow[]> = {};
    for (const ev of evals) criteriaMap[ev.id] = await getCriterionEvaluations(ev.id);
    setCriteriaByEvaluation(criteriaMap);
  }, [assignment.id]);

  useEffect(() => {
    void refresh();
    setPackageText(null);
    setImportText("");
    setImportErrors([]);
  }, [refresh]);

  const latestSubmission = submissions[0] ?? null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await submitWork(assignment.id, { content: content.trim() });
      setContent("");
      await refresh();
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGeneratePackage() {
    if (!latestSubmission) return;
    setPackageText(await generateEvaluationPackage(assignment, latestSubmission));
  }

  async function handleCopyPackage() {
    if (!packageText) return;
    await navigator.clipboard.writeText(packageText);
  }

  const acceptedFirstPass = evaluations.find((ev) => ev.is_calibration === 0);

  async function handleImport() {
    if (!latestSubmission || !importText.trim()) return;
    setImportErrors([]);
    const result = await importEvaluationResponse(
      assignment.id,
      latestSubmission.id,
      importText.trim(),
      calibrationMode && acceptedFirstPass ? { calibrationOfId: acceptedFirstPass.id } : undefined,
    );
    if (result.errors.length > 0) {
      setImportErrors(result.errors);
      return;
    }
    if (result.requiresCalibrationReview) {
      setCalibrationNote(
        `Las dos evaluaciones difieren en ${result.calibrationDifference} puntos (más de 7). Ninguna quedó aceptada automáticamente — revisá ambas antes de decidir.`,
      );
    } else {
      setCalibrationNote(null);
    }
    setImportText("");
    await refresh();
  }

  async function handleAccept(evaluationId: string) {
    await acceptEvaluation(evaluationId);
    await refresh();
    onChanged();
    onXpAwarded();
  }

  async function handleRequestRevision(evaluationId: string) {
    await requestRevision(evaluationId);
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg text-text-primary">{assignment.title}</h3>
        <p className="mt-1 text-xs text-text-muted">
          {assignment.work_type.replace(/_/g, " ")} · {assignment.status.replace(/_/g, " ")}
        </p>
        {assignment.prompt && <p className="mt-2 text-sm text-text-secondary">{assignment.prompt}</p>}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Entregar trabajo</h4>
        <form onSubmit={handleSubmit} className="mt-2 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Pegá o escribí el trabajo completo…"
            rows={6}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
          >
            {submitting ? "Entregando…" : "Entregar"}
          </button>
        </form>
        {latestSubmission && (
          <p className="mt-1 text-xs text-text-muted">Última entrega: versión {latestSubmission.version}</p>
        )}
      </div>

      {latestSubmission && (
        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Paquete de evaluación ({EVALUATION_DISCLAIMER})
            </h4>
            <button
              onClick={handleGeneratePackage}
              className="rounded border border-border px-2 py-1 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
            >
              Evaluar trabajo con ChatGPT
            </button>
          </div>
          {packageText && (
            <div className="mt-2">
              <textarea
                readOnly
                value={packageText}
                rows={10}
                className="w-full rounded border border-border-subtle bg-background p-3 font-mono text-xs text-text-primary"
              />
              <button
                onClick={handleCopyPackage}
                className="mt-2 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
              >
                Copiar para ChatGPT
              </button>
            </div>
          )}

          <div className="mt-4">
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={calibrationMode} onChange={(e) => setCalibrationMode(e.target.checked)} disabled={!acceptedFirstPass} />
              Esta importación es la segunda pasada (calibración) de la evaluación existente
            </label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Pegá acá la respuesta JSON de ChatGPT…"
              rows={6}
              className="mt-2 w-full rounded border border-border bg-background p-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleImport}
              disabled={!importText.trim()}
              className="mt-2 rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              Importar evaluación
            </button>
            {importErrors.length > 0 && (
              <ul className="mt-2 space-y-1 rounded border border-danger/40 bg-danger/5 p-2 text-xs text-danger">
                {importErrors.map((err) => (
                  <li key={err}>· {err}</li>
                ))}
              </ul>
            )}
            {calibrationNote && <p className="mt-2 text-xs text-warning">{calibrationNote}</p>}
          </div>
        </div>
      )}

      {evaluations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Evaluaciones</h4>
          <ul className="mt-2 space-y-2">
            {evaluations.map((ev) => (
              <li key={ev.id} className="rounded border border-border-subtle bg-surface p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-primary">
                    {ev.total_score}/100 · {ev.score_10.toFixed(1)}/10 {ev.is_calibration ? "(calibración)" : ""}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-text-muted">{ev.status.replace(/_/g, " ")}</span>
                </div>
                {ev.evaluator_notes && <p className="mt-1 text-xs text-text-secondary">{ev.evaluator_notes}</p>}
                <ul className="mt-2 space-y-1 text-xs text-text-muted">
                  {(criteriaByEvaluation[ev.id] ?? []).map((c) => (
                    <li key={c.id}>
                      {c.criterion_id}: {c.score}/{c.maximum} — {c.justification}
                    </li>
                  ))}
                </ul>
                {ev.status === "pendiente" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleAccept(ev.id)}
                      className="rounded border border-success px-2 py-1 text-xs text-success"
                    >
                      Aceptar
                    </button>
                    <button
                      onClick={() => handleRequestRevision(ev.id)}
                      className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-warning hover:text-warning"
                    >
                      Solicitar revisión
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
