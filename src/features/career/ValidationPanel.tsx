import { useEffect, useState } from "react";
import {
  buildValidationPromptForChatGpt,
  startTopicValidation,
  submitChatGptValidation,
  submitLocalValidation,
  type LocalCriterionScore,
  type ValidationSession,
} from "@/services/knowledgeValidation";
import { getOrCreateValidationRubric } from "@/services/rubrics";
import { acceptEvaluation } from "@/services/evaluations";
import { EVALUATION_DISCLAIMER } from "@/services/evaluations";
import type { RubricCriterionRow } from "@/database/types";

type Mode = "A" | "B";

export function ValidationPanel({
  topicId,
  topicTitle,
  onClose,
  onAccepted,
}: {
  topicId: string;
  topicTitle: string;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ValidationSession | null>(null);
  const [criteria, setCriteria] = useState<RubricCriterionRow[]>([]);
  const [mode, setMode] = useState<Mode>("A");
  const [answersText, setAnswersText] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pastedResponse, setPastedResponse] = useState("");
  const [result, setResult] = useState<{ evaluationId: string; totalScore: number; verdict: string } | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, rubric] = await Promise.all([startTopicValidation(topicId), getOrCreateValidationRubric()]);
        if (cancelled) return;
        setSession(s);
        setCriteria(rubric.criteria);
        const initialScores: Record<string, number> = {};
        for (const c of rubric.criteria) initialScores[c.code] = 0;
        setScores(initialScores);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  if (loading) {
    return <div className="rounded border border-border-subtle bg-surface p-4 text-xs text-text-muted">Cargando…</div>;
  }

  if (error || !session) {
    return (
      <div className="rounded border border-danger/40 bg-surface p-4 text-xs text-danger">
        {error ?? "No se pudo iniciar la validación."}
        <button onClick={onClose} className="ml-2 underline">
          Cerrar
        </button>
      </div>
    );
  }

  async function handleGeneratePrompt() {
    const text = await buildValidationPromptForChatGpt(session!.assignment, answersText);
    setPrompt(text);
  }

  async function handleCopyPrompt() {
    if (prompt) await navigator.clipboard.writeText(prompt);
  }

  async function handleSubmitLocal() {
    setSubmitting(true);
    setSubmitErrors([]);
    try {
      const criteriaScores: LocalCriterionScore[] = criteria.map((c) => ({
        criterionId: c.code,
        score: scores[c.code] ?? 0,
        maximum: c.weight_points,
        justification: "",
      }));
      const res = await submitLocalValidation(session!.assignment, session!.assignment.rubric_version_id!, answersText, criteriaScores, notes);
      if (res.errors.length > 0) {
        setSubmitErrors(res.errors);
      } else if (res.evaluation) {
        setResult({ evaluationId: res.evaluation.id, totalScore: res.evaluation.total_score, verdict: res.evaluation.verdict });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitChatGpt() {
    setSubmitting(true);
    setSubmitErrors([]);
    try {
      const res = await submitChatGptValidation(session!.assignment, answersText, pastedResponse);
      if (res.errors.length > 0) {
        setSubmitErrors(res.errors);
      } else if (res.evaluation) {
        setResult({ evaluationId: res.evaluation.id, totalScore: res.evaluation.total_score, verdict: res.evaluation.verdict });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept() {
    if (!result) return;
    setAccepting(true);
    try {
      await acceptEvaluation(result.evaluationId);
      setAccepted(true);
      onAccepted();
    } finally {
      setAccepting(false);
    }
  }

  const maxTotal = criteria.reduce((sum, c) => sum + c.weight_points, 0);
  const currentTotal = criteria.reduce((sum, c) => sum + (scores[c.code] ?? 0), 0);

  return (
    <div className="space-y-3 rounded border border-accent/40 bg-surface p-4 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-text-primary">Validar conocimiento — {topicTitle}</p>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          ✕
        </button>
      </div>

      <div>
        <p className="text-text-muted">Preguntas ({session.questions.length}):</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-text-secondary">
          {session.questions.map((q, i) => (
            <li key={i}>{q.text}</li>
          ))}
        </ol>
      </div>

      {!result && (
        <>
          <div>
            <label className="text-text-muted">Tus respuestas (todas juntas está bien)</label>
            <textarea
              value={answersText}
              onChange={(e) => setAnswersText(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-border bg-background p-2 text-text-primary"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setMode("A")}
              className={`rounded border px-2 py-1 ${mode === "A" ? "border-accent text-accent" : "border-border text-text-secondary"}`}
            >
              Modo A — Autoevaluación local
            </button>
            <button
              onClick={() => setMode("B")}
              className={`rounded border px-2 py-1 ${mode === "B" ? "border-accent text-accent" : "border-border text-text-secondary"}`}
            >
              Modo B — Con ChatGPT
            </button>
          </div>

          {mode === "A" && (
            <div className="space-y-2">
              <p className="text-text-muted">Puntuá cada criterio vos mismo (0 al máximo):</p>
              {criteria.map((c) => (
                <div key={c.code} className="flex items-center justify-between gap-2">
                  <span className="text-text-secondary">
                    {c.title} (0–{c.weight_points})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={c.weight_points}
                    value={scores[c.code] ?? 0}
                    onChange={(e) =>
                      setScores((prev) => ({ ...prev, [c.code]: Math.min(c.weight_points, Math.max(0, Number(e.target.value))) }))
                    }
                    className="w-16 rounded border border-border bg-background px-2 py-1 text-text-primary"
                  />
                </div>
              ))}
              <p className="text-text-secondary">
                Total: {currentTotal} / {maxTotal}
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas de la autoevaluación (opcional)"
                rows={2}
                className="w-full rounded border border-border bg-background p-2 text-text-primary"
              />
              <button
                disabled={submitting}
                onClick={() => void handleSubmitLocal()}
                className="rounded border border-accent px-3 py-1.5 uppercase tracking-wide text-accent disabled:opacity-50"
              >
                {submitting ? "Registrando…" : "Registrar autoevaluación"}
              </button>
            </div>
          )}

          {mode === "B" && (
            <div className="space-y-2">
              <button
                onClick={() => void handleGeneratePrompt()}
                className="rounded border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
              >
                Generar prompt para ChatGPT
              </button>
              {prompt && (
                <>
                  <textarea readOnly value={prompt} rows={6} className="w-full rounded border border-border bg-background p-2 text-text-secondary" />
                  <button onClick={() => void handleCopyPrompt()} className="rounded border border-border px-2 py-1 text-text-secondary">
                    Copiar
                  </button>
                  <p className="text-text-muted">Pegá acá la respuesta JSON de ChatGPT:</p>
                  <textarea
                    value={pastedResponse}
                    onChange={(e) => setPastedResponse(e.target.value)}
                    rows={6}
                    className="w-full rounded border border-border bg-background p-2 text-text-primary"
                  />
                  <button
                    disabled={submitting}
                    onClick={() => void handleSubmitChatGpt()}
                    className="rounded border border-accent px-3 py-1.5 uppercase tracking-wide text-accent disabled:opacity-50"
                  >
                    {submitting ? "Registrando…" : "Registrar respuesta"}
                  </button>
                </>
              )}
            </div>
          )}

          {submitErrors.length > 0 && (
            <div className="rounded border border-danger/40 p-2 text-danger">
              {submitErrors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </>
      )}

      {result && (
        <div className="space-y-2 rounded border border-border-subtle p-3">
          <p className="text-text-muted">{EVALUATION_DISCLAIMER}</p>
          <p className="text-text-primary">
            Resultado: {result.totalScore} / 100 — {result.verdict}
          </p>
          {!accepted ? (
            <button
              disabled={accepting}
              onClick={() => void handleAccept()}
              className="rounded border border-accent px-3 py-1.5 uppercase tracking-wide text-accent disabled:opacity-50"
            >
              {accepting ? "Aceptando…" : "Aceptar y otorgar XP"}
            </button>
          ) : (
            <p className="text-success">Validación aceptada.</p>
          )}
        </div>
      )}
    </div>
  );
}
