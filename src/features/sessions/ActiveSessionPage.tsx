import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  studyBlocksRepo,
  pomodoroCyclesRepo,
  competenciesRepo,
  topicsRepo,
  studySessionsRepo,
} from "@/database/entities";
import type { CompetencyRow, StudyBlockRow, StudySessionRow, TopicRow } from "@/database/types";
import { cancelSession, finalizeSession, recordComprobacion } from "@/services/sessions";
import { getVaultPath, openVaultInObsidian } from "@/services/obsidian";
import {
  usePomodoro,
  DEFAULT_POMODORO_SETTINGS,
  type PomodoroPhase,
} from "./usePomodoro";

const PHASE_LABEL: Record<PomodoroPhase, string> = {
  foco: "Foco",
  pausa_corta: "Pausa corta",
  pausa_larga: "Pausa larga",
};

const COMPROBACION_METHODS = [
  "explicacion_propia",
  "pregunta_recuperacion",
  "ejercicio",
  "comparacion",
  "objecion",
  "caso_aplicado",
  "mapa_conceptual",
  "modelo",
  "decision",
  "producto",
];

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatElapsed(startedAt: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

export function ActiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<StudySessionRow | null>(null);
  const [competency, setCompetency] = useState<CompetencyRow | null>(null);
  const [topic, setTopic] = useState<TopicRow | null>(null);
  const [blocks, setBlocks] = useState<StudyBlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  const [noteText, setNoteText] = useState("");
  const [showComprobar, setShowComprobar] = useState(false);
  const [comprobarMethod, setComprobarMethod] = useState(COMPROBACION_METHODS[0]!);
  const [comprobarResponse, setComprobarResponse] = useState("");
  const [lastComprobacion, setLastComprobacion] = useState<string | null>(null);

  const [showFinalize, setShowFinalize] = useState(false);
  const [obsidianError, setObsidianError] = useState<string | null>(null);
  const [conclusion, setConclusion] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [continuityPoint, setContinuityPoint] = useState("");
  const [masteryLevel, setMasteryLevel] = useState("");
  const [masteryConfidence, setMasteryConfidence] = useState("70");
  const [masteryDifficulty, setMasteryDifficulty] = useState("50");
  const [masteryExplanation, setMasteryExplanation] = useState("");
  const [needsReview, setNeedsReview] = useState(true);
  const [reviewDueAt, setReviewDueAt] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [vaultConfigured, setVaultConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const row = await studySessionsRepo.getById(id);
    setSession(row);
    if (row) {
      const [c, t, b, vault] = await Promise.all([
        row.competency_id ? competenciesRepo.getById(row.competency_id) : Promise.resolve(null),
        row.topic_id ? topicsRepo.getById(row.topic_id) : Promise.resolve(null),
        studyBlocksRepo.list({ where: "study_session_id = ?", params: [row.id], orderBy: "created_at DESC" }),
        getVaultPath(),
      ]);
      setCompetency(c);
      setTopic(t);
      setBlocks(b);
      setVaultConfigured(vault !== null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const onPhaseComplete = useCallback(
    (phase: PomodoroPhase, plannedMinutes: number, actualMinutes: number, interrupted: boolean) => {
      if (!session) return;
      void pomodoroCyclesRepo.insert({
        id: crypto.randomUUID(),
        study_session_id: session.id,
        cycle_index: 0,
        phase,
        planned_minutes: plannedMinutes,
        actual_minutes: actualMinutes,
        interrupted: interrupted ? 1 : 0,
        started_at: null,
        ended_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    },
    [session],
  );

  const pomodoro = usePomodoro(DEFAULT_POMODORO_SETTINGS, onPhaseComplete);

  async function handleSaveNote() {
    if (!session || !noteText.trim()) return;
    const row: StudyBlockRow = {
      id: crypto.randomUUID(),
      study_session_id: session.id,
      block_type: "consolidacion",
      started_at: null,
      ended_at: new Date().toISOString(),
      quick_notes: noteText,
      status: "activo",
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await studyBlocksRepo.insert(row);
    setNoteText("");
    setBlocks((prev) => [row, ...prev]);
  }

  async function handleComprobar(e: FormEvent) {
    e.preventDefault();
    if (!session || !comprobarResponse.trim()) return;
    const evidence = await recordComprobacion(session.id, {
      method: comprobarMethod,
      response: comprobarResponse,
    });
    setLastComprobacion(evidence.description);
    setEvidenceSummary((prev) => prev || evidence.description || "");
    setShowComprobar(false);
    setComprobarResponse("");
  }

  async function handleFinalize(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFinalizeError(null);
    setFinalizing(true);
    try {
      await finalizeSession(session.id, {
        conclusion,
        evidenceSummary,
        nextAction,
        continuityPoint,
        needsReview,
        reviewDueAt: reviewDueAt ? new Date(`${reviewDueAt}T00:00:00`).toISOString() : null,
        ...(masteryLevel !== ""
          ? {
              masteryLevel: Number(masteryLevel),
              masteryConfidence: Number(masteryConfidence),
              masteryDifficulty: Number(masteryDifficulty),
              ...(masteryExplanation ? { masteryExplanation } : {}),
            }
          : {}),
      });
      navigate("/sesiones");
    } catch (error) {
      setFinalizeError(String(error instanceof Error ? error.message : error));
    } finally {
      setFinalizing(false);
    }
  }

  async function handleCancel() {
    if (!session) return;
    const confirmed = window.confirm("¿Cancelar esta sesión? Queda registrada como incompleta.");
    if (!confirmed) return;
    await cancelSession(session.id);
    navigate("/sesiones");
  }

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;
  if (!session) return <div className="p-10 text-sm text-danger">La sesión no existe.</div>;

  if (session.closure_status !== "en_curso") {
    return (
      <div className="mx-auto max-w-2xl p-10">
        <Link to="/sesiones" className="text-sm text-text-secondary hover:text-accent">
          ← Sesiones
        </Link>
        <h1 className="mt-3 font-display text-2xl">{session.observable_objective}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Estado: {session.closure_status} · {session.started_at && new Date(session.started_at).toLocaleString("es-AR")}
        </p>
        {session.conclusion && (
          <Field label="Conclusión">{session.conclusion}</Field>
        )}
        {session.evidence_summary && <Field label="Evidencia">{session.evidence_summary}</Field>}
        {session.next_action && <Field label="Próxima acción">{session.next_action}</Field>}
        {session.continuity_point && <Field label="Punto de continuidad">{session.continuity_point}</Field>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-10">
      <div>
        <p className="text-xs uppercase tracking-wide text-text-muted">
          {[topic?.title, competency?.title].filter(Boolean).join(" · ") || "Sin ubicar en el mapa"}
        </p>
        <h1 className="mt-1 font-display text-2xl">{session.observable_objective}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Transcurrido: {session.started_at ? formatElapsed(session.started_at, nowMs) : "—"}
          {session.planned_duration_min ? ` · Planificado: ${session.planned_duration_min} min` : ""}
        </p>
      </div>

      <section className="rounded border border-border-subtle bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">{PHASE_LABEL[pomodoro.phase]}</p>
            <p className="font-display text-4xl tabular-nums">{formatClock(pomodoro.remainingSeconds)}</p>
          </div>
          <div className="flex gap-2">
            {!pomodoro.running ? (
              <button onClick={pomodoro.start} className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent">
                Iniciar
              </button>
            ) : (
              <button onClick={pomodoro.pause} className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary">
                Pausar
              </button>
            )}
            <button onClick={pomodoro.skip} className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary">
              Saltar fase
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Notas rápidas</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Anotar algo sin interrumpir el flujo…"
            className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button onClick={handleSaveNote} className="rounded border border-border px-3 py-2 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent">
            Guardar
          </button>
        </div>
        {blocks.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-text-secondary">
            {blocks.map((b) => (
              <li key={b.id}>· {b.quick_notes}</li>
            ))}
          </ul>
        )}
      </section>

      {session.resources && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Recursos</h2>
          <p className="mt-1 text-sm text-text-secondary">{session.resources}</p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => openUrl("https://chat.openai.com")} className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent">
          Abrir ChatGPT
        </button>
        <button
          disabled={!vaultConfigured}
          title={vaultConfigured ? undefined : "Configurá el vault en Obsidian primero"}
          onClick={async () => {
            setObsidianError(null);
            const result = await openVaultInObsidian();
            if (!result.success) setObsidianError(result.error ?? "No se pudo abrir Obsidian.");
          }}
          className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:text-text-muted disabled:opacity-50"
        >
          Abrir Obsidian
        </button>
        <button onClick={() => setShowComprobar(true)} className="rounded border border-accent px-4 py-2 text-sm uppercase tracking-wide text-accent">
          Comprobar
        </button>
        <button onClick={() => setShowFinalize(true)} className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent">
          Finalizar estudio
        </button>
        <button onClick={handleCancel} className="rounded border border-danger px-4 py-2 text-sm text-danger">
          Cancelar sesión
        </button>
      </div>
      {obsidianError && (
        <p className="text-xs text-danger">
          No se pudo abrir Obsidian: {obsidianError}. Verificá la integración en Configuración → Obsidian.
        </p>
      )}
      {lastComprobacion && (
        <p className="text-xs text-success">Última comprobación registrada. Se usó como base de la evidencia de cierre.</p>
      )}

      {showComprobar && (
        <Modal onClose={() => setShowComprobar(false)} title="Comprobar">
          <form onSubmit={handleComprobar} className="space-y-3">
            <Field label="Método">
              <select value={comprobarMethod} onChange={(e) => setComprobarMethod(e.target.value)} className={selectClass}>
                {COMPROBACION_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Respuesta / explicación">
              <textarea
                value={comprobarResponse}
                onChange={(e) => setComprobarResponse(e.target.value)}
                rows={4}
                className={inputClass}
                required
              />
            </Field>
            <button type="submit" className="rounded border border-accent px-4 py-2 text-sm uppercase tracking-wide text-accent">
              Registrar
            </button>
          </form>
        </Modal>
      )}

      {showFinalize && (
        <Modal onClose={() => setShowFinalize(false)} title="Finalizar estudio">
          <form onSubmit={handleFinalize} className="space-y-3">
            <Field label="Conclusión *" required>
              <textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} rows={2} className={inputClass} required />
            </Field>
            <Field label="Evidencia de aprendizaje *" required>
              <textarea value={evidenceSummary} onChange={(e) => setEvidenceSummary(e.target.value)} rows={2} className={inputClass} required />
            </Field>
            <Field label="Próxima acción *" required>
              <textarea value={nextAction} onChange={(e) => setNextAction(e.target.value)} rows={2} className={inputClass} required />
            </Field>
            <Field label="Punto de continuidad *" required>
              <textarea
                value={continuityPoint}
                onChange={(e) => setContinuityPoint(e.target.value)}
                rows={2}
                placeholder="Debe poder entenderse meses después."
                className={inputClass}
                required
              />
            </Field>

            {competency && (
              <Field label={`Nivel de dominio alcanzado — ${competency.title}`}>
                <select value={masteryLevel} onChange={(e) => setMasteryLevel(e.target.value)} className={selectClass}>
                  <option value="">No evaluar ahora</option>
                  <option value="0">0 — Desconocido</option>
                  <option value="1">1 — Reconocimiento superficial</option>
                  <option value="2">2 — Explicación parcial</option>
                  <option value="3">3 — Aplicación con ayuda</option>
                  <option value="4">4 — Aplicación autónoma</option>
                  <option value="5">5 — Crítica, enseñanza y adaptación</option>
                </select>
              </Field>
            )}
            {masteryLevel !== "" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Confianza declarada (${masteryConfidence}%)`}>
                  <input type="range" min={0} max={100} value={masteryConfidence} onChange={(e) => setMasteryConfidence(e.target.value)} className="w-full" />
                </Field>
                <Field label={`Dificultad percibida (${masteryDifficulty}%)`}>
                  <input type="range" min={0} max={100} value={masteryDifficulty} onChange={(e) => setMasteryDifficulty(e.target.value)} className="w-full" />
                </Field>
              </div>
            )}
            {masteryLevel !== "" && (
              <Field label="Por qué ese nivel (opcional)">
                <textarea
                  value={masteryExplanation}
                  onChange={(e) => setMasteryExplanation(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </Field>
            )}

            <Field label="¿Necesita repaso?">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
                Programar repaso
              </label>
            </Field>
            {needsReview && (
              <Field label="Fecha de repaso">
                <input type="date" value={reviewDueAt} onChange={(e) => setReviewDueAt(e.target.value)} className={inputClass} />
              </Field>
            )}

            {finalizeError && <p className="text-xs text-danger">{finalizeError}</p>}
            <button
              type="submit"
              disabled={finalizing}
              className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent disabled:opacity-40"
            >
              {finalizing ? "Cerrando…" : "Cerrar sesión"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-8" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded border border-border bg-surface-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <div className="mt-1 text-sm text-text-primary">{children}</div>
    </label>
  );
}

const selectClass =
  "w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none";
const inputClass =
  "w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none";
