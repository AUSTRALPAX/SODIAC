import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  obsidianNotesRepo,
  studyBlocksRepo,
  pomodoroCyclesRepo,
  competenciesRepo,
  resourcesRepo,
  subjectsRepo,
  topicsRepo,
  studySessionsRepo,
} from "@/database/entities";
import type {
  CompetencyRow,
  ObsidianNoteRow,
  ResourceRow,
  StudyBlockRow,
  StudySessionRow,
  SubjectRow,
  TaskRow,
  TopicRow,
} from "@/database/types";
import {
  cancelSession,
  finalizeSession,
  getRelatedTaskForSession,
  recordComprobacion,
  saveSessionDraft,
} from "@/services/sessions";
import { getBibliographyForSubject, getBibliographyForTopic, openResource } from "@/services/library";
import { recordResourceUsage } from "@/services/resourceUsage";
import { registerPendingSave } from "@/services/closeGuard";
import { createNoteFromTemplate, getVaultPath, indexVault, openNoteInObsidian, openVaultInObsidian } from "@/services/obsidian";
import {
  checkSubjectCompletionGate,
  previewSubjectCompletion,
  previewTaskCompletion,
  previewTopicCompletion,
  type SubjectCompletionGate,
} from "@/services/completionXp";
import { usePomodoro, type PomodoroPhase } from "./usePomodoro";
import { DEFAULT_POMODORO_SETTINGS, getPomodoroSettings, type PomodoroSettings } from "@/services/pomodoroSettings";

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
  const location = useLocation();

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
  const [externalScore, setExternalScore] = useState("");
  const [needsReview, setNeedsReview] = useState(true);
  const [reviewDueAt, setReviewDueAt] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [vaultConfigured, setVaultConfigured] = useState(false);

  // Nota de Obsidian vinculada al tema de esta sesión (por sodiac_id) — para
  // que "Abrir Obsidian" lleve directo a la nota, no solo al vault.
  const [relatedNote, setRelatedNote] = useState<ObsidianNoteRow | null>(null);
  const [relatedResources, setRelatedResources] = useState<ResourceRow[]>([]);
  const [usedResourceIds, setUsedResourceIds] = useState<Set<string>>(new Set());
  const [showMissingNoteInfo, setShowMissingNoteInfo] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [createNoteError, setCreateNoteError] = useState<string | null>(null);

  // Autoguardado del cierre en curso (H3): permite recuperar el texto si la
  // app se cierra antes de confirmar "Finalizar estudio".
  const [draftStatus, setDraftStatus] = useState<"idle" | "guardando" | "guardado" | "error">("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fase B: XP directo al cerrar la sesión — sin exportar JSON ni pasar por ChatGPT.
  const [relatedTask, setRelatedTask] = useState<TaskRow | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [subjectGate, setSubjectGate] = useState<SubjectCompletionGate | null>(null);
  const [taskXpPreview, setTaskXpPreview] = useState(0);
  const [topicXpPreview, setTopicXpPreview] = useState(0);
  const [subjectXpPreview, setSubjectXpPreview] = useState(0);
  const [completeTaskChecked, setCompleteTaskChecked] = useState(false);
  const [completeTopicChecked, setCompleteTopicChecked] = useState(false);
  const [completeSubjectChecked, setCompleteSubjectChecked] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const row = await studySessionsRepo.getById(id);
    setSession(row);
    if (row) {
      const [c, t, b, vault, task, subj, notes] = await Promise.all([
        row.competency_id ? competenciesRepo.getById(row.competency_id) : Promise.resolve(null),
        row.topic_id ? topicsRepo.getById(row.topic_id) : Promise.resolve(null),
        studyBlocksRepo.list({ where: "study_session_id = ?", params: [row.id], orderBy: "created_at DESC" }),
        getVaultPath(),
        getRelatedTaskForSession(row.id),
        row.subject_id ? subjectsRepo.getById(row.subject_id) : Promise.resolve(null),
        row.topic_id ? obsidianNotesRepo.list({ where: "sodiac_id = ?", params: [row.topic_id] }) : Promise.resolve([]),
      ]);
      setCompetency(c);
      setTopic(t);
      // Tildado por defecto: si la sesión tiene un tema vinculado que todavía no
      // está completo, se asume que terminar de estudiarlo hoy lo completa —
      // el usuario puede destildarlo si esta sesión no cerró el tema del todo.
      if (t && !t.completed_at) setCompleteTopicChecked(true);
      setBlocks(b);
      setVaultConfigured(vault !== null);
      setRelatedTask(task && !task.completed_at ? task : null);
      setSubject(subj && !subj.completed_at ? subj : null);
      setRelatedNote(notes[0] ?? null);

      const bibliographyLinks = [
        ...(row.topic_id ? await getBibliographyForTopic(row.topic_id) : []),
        ...(row.subject_id ? await getBibliographyForSubject(row.subject_id) : []),
      ];
      const resourceIds = [...new Set(bibliographyLinks.map((l) => l.resource_id))];
      const fetchedResources =
        resourceIds.length > 0 ? await Promise.all(resourceIds.map((rid) => resourcesRepo.getById(rid))) : [];
      setRelatedResources(fetchedResources.filter((r): r is ResourceRow => r != null));

      const [taskPreview, topicPreview, subjectPreview, gate] = await Promise.all([
        task && !task.completed_at ? previewTaskCompletion(task) : Promise.resolve(null),
        t && !t.completed_at ? previewTopicCompletion(t) : Promise.resolve(null),
        subj && !subj.completed_at ? previewSubjectCompletion(subj) : Promise.resolve(null),
        row.subject_id ? checkSubjectCompletionGate(row.subject_id) : Promise.resolve(null),
      ]);
      setTaskXpPreview(taskPreview?.amount ?? 0);
      setTopicXpPreview(topicPreview?.amount ?? 0);
      setSubjectXpPreview(subjectPreview?.amount ?? 0);
      setSubjectGate(gate);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const state = location.state as { autoFinalize?: boolean } | null;
    if (!state?.autoFinalize || !session) return;
    setConclusion(session.conclusion ?? "");
    setEvidenceSummary(session.evidence_summary ?? "");
    setNextAction(session.next_action ?? "");
    setContinuityPoint(session.continuity_point ?? "");
    setShowFinalize(true);
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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

  const [pomodoroSettings, setPomodoroSettingsState] = useState<PomodoroSettings>(DEFAULT_POMODORO_SETTINGS);
  useEffect(() => {
    void getPomodoroSettings().then(setPomodoroSettingsState);
  }, []);

  const pomodoro = usePomodoro(pomodoroSettings, onPhaseComplete);

  useEffect(() => {
    if (!session || !showFinalize) return;
    if (!conclusion.trim() && !evidenceSummary.trim() && !nextAction.trim() && !continuityPoint.trim()) return;

    if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    setDraftStatus("guardando");
    draftTimeoutRef.current = setTimeout(() => {
      void saveSessionDraft(session.id, {
        conclusion,
        evidenceSummary,
        nextAction,
        continuityPoint,
      })
        .then(() => {
          setDraftStatus("guardado");
          setDraftSavedAt(new Date());
        })
        .catch(() => setDraftStatus("error"));
    }, 1500);

    return () => {
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    };
  }, [session, showFinalize, conclusion, evidenceSummary, nextAction, continuityPoint]);

  const draftValuesRef = useRef({ conclusion, evidenceSummary, nextAction, continuityPoint });
  useEffect(() => {
    draftValuesRef.current = { conclusion, evidenceSummary, nextAction, continuityPoint };
  });

  useEffect(() => {
    if (!session || !showFinalize) return;
    return registerPendingSave(async () => {
      const v = draftValuesRef.current;
      if (!v.conclusion.trim() && !v.evidenceSummary.trim() && !v.nextAction.trim() && !v.continuityPoint.trim()) return;
      await saveSessionDraft(session.id, {
        conclusion: v.conclusion,
        evidenceSummary: v.evidenceSummary,
        nextAction: v.nextAction,
        continuityPoint: v.continuityPoint,
      });
    });
  }, [session, showFinalize]);

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
              ...(externalScore !== "" ? { externalScore0to10: Number(externalScore) } : {}),
            }
          : {}),
        completions: {
          completeTask: completeTaskChecked,
          completeTopic: completeTopicChecked,
          completeSubject: completeSubjectChecked,
        },
      });
      // `replace`: la sesión quedó cerrada, volver a esta pantalla con Atrás
      // mostraría una sesión activa que ya no existe.
      navigate("/sesiones", { replace: true });
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
    navigate("/sesiones", { replace: true });
  }

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Crea la nota faltante para el tema de esta sesión, vinculada por
   * sodiac_id (mismo mecanismo que usan las 495 notas ya reconciliadas
   * desde el vault) — para los ~43 temas legacy que nunca tuvieron una
   * nota real. Se guarda directamente en 05_Temas/ (ya existe en todo vault
   * real, a diferencia de una subcarpeta nueva — crear una carpeta nueva
   * dentro del vault falla con "os error 2" en esta instalación, así que
   * evitamos necesitar mkdir) con el prefijo "sodiac-" para no mezclarse
   * con la numeración canónica MAT-XX/T-XX.YY.
   */
  async function handleCreateNoteForTopic() {
    if (!topic) return;
    setCreatingNote(true);
    setCreateNoteError(null);
    try {
      const relativePath = `05_Temas/sodiac-${slugify(topic.title)}.md`;
      await createNoteFromTemplate(
        relativePath,
        {
          sodiac_id: topic.id,
          tipo: "tema",
          materia: subject?.title ?? null,
          tema: topic.title,
          estado: "activa",
          dominio: 0,
          progreso: 0,
        },
        `# ${topic.title}\n\n${subject ? `Materia: ${subject.title}\n\n` : ""}Escribí acá el desarrollo de este tema.\n`,
      );
      await indexVault(); // el archivo recién creado necesita indexarse para que sodiac_id quede consultable.
      const notes = await obsidianNotesRepo.list({ where: "sodiac_id = ?", params: [topic.id] });
      setRelatedNote(notes[0] ?? null);
      setShowMissingNoteInfo(false);
      if (notes[0]) await openNoteInObsidian(notes[0].vault_relative_path);
    } catch (e) {
      setCreateNoteError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingNote(false);
    }
  }

  /** Abre el recurso si tiene archivo/enlace (eso ya registra "abierto") y siempre marca "usado en esta sesión". */
  async function handleUseResource(resource: ResourceRow) {
    if (resource.file_path || resource.url) {
      try {
        await openResource(resource);
      } catch {
        // Sin archivo/URL válido — igual se registra el uso más abajo.
      }
    }
    await recordResourceUsage({ resourceId: resource.id, sessionId: id ?? null, action: "utilizado_en_sesion" });
    setUsedResourceIds((prev) => new Set(prev).add(resource.id));
  }

  /** Ruta jerárquica: Sesiones › materia (enlazada) › tema. La materia es un
   * enlace real a su detalle; el tema cierra la ruta como texto. */
  function sessionCrumbs(fallback: string) {
    const items: { label: string; to?: string }[] = [{ label: "Sesiones", to: "/sesiones" }];
    if (subject) items.push({ label: subject.title, to: `/carrera/${subject.id}` });
    if (topic) items.push({ label: topic.title });
    if (items.length === 1) items.push({ label: fallback });
    return items;
  }

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;
  if (!session) return <div className="p-10 text-sm text-danger">La sesión no existe.</div>;

  if (session.closure_status !== "en_curso") {
    return (
      <div className="mx-auto max-w-2xl p-10">
        <Breadcrumb items={sessionCrumbs("Sesión")} />
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
      <Breadcrumb items={sessionCrumbs("Sesión activa")} />
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
            {pomodoro.finished ? (
              <>
                <p className="text-xs uppercase tracking-wide text-text-muted">Pomodoro completo</p>
                <p className="font-display text-2xl text-accent">¡Listo!</p>
                <p className="mt-1 text-xs text-text-muted">
                  Completaste {pomodoroSettings.totalSessions} sesión{pomodoroSettings.totalSessions === 1 ? "" : "es"} de enfoque.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  {PHASE_LABEL[pomodoro.phase]} · sesión {pomodoro.cycleIndex} de {pomodoroSettings.totalSessions}
                </p>
                <p className="font-display text-4xl tabular-nums">{formatClock(pomodoro.remainingSeconds)}</p>
              </>
            )}
          </div>
          {!pomodoro.finished && (
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
          )}
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

      {relatedResources.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Bibliografía relacionada</h2>
          <ul className="mt-1 space-y-1 rounded border border-border-subtle bg-surface p-3 text-sm text-text-secondary">
            {relatedResources.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>
                  {r.title}
                  {r.author ? ` — ${r.author}` : ""}
                </span>
                <button
                  onClick={() => void handleUseResource(r)}
                  className={`shrink-0 rounded border px-2 py-0.5 text-xs uppercase tracking-wide ${
                    usedResourceIds.has(r.id)
                      ? "border-success text-success"
                      : "border-border text-text-secondary hover:border-accent hover:text-accent"
                  }`}
                >
                  {usedResourceIds.has(r.id) ? "Usado en esta sesión" : "Usar este recurso"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            if (topic && !relatedNote) {
              setShowMissingNoteInfo(true);
              return;
            }
            const result = relatedNote
              ? await openNoteInObsidian(relatedNote.vault_relative_path)
              : await openVaultInObsidian();
            if (!result.success) setObsidianError(result.error ?? "No se pudo abrir Obsidian.");
          }}
          className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:text-text-muted disabled:opacity-50"
        >
          {relatedNote ? "Abrir nota en Obsidian" : "Abrir Obsidian"}
        </button>
        <button onClick={() => setShowComprobar(true)} className="rounded border border-accent px-4 py-2 text-sm uppercase tracking-wide text-accent">
          Comprobar
        </button>
        <button
          onClick={() => {
            setConclusion(session.conclusion ?? "");
            setEvidenceSummary(session.evidence_summary ?? "");
            setNextAction(session.next_action ?? "");
            setContinuityPoint(session.continuity_point ?? "");
            setShowFinalize(true);
          }}
          className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent"
        >
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
      {showMissingNoteInfo && topic && (
        <div className="rounded border border-warning/40 bg-warning/5 p-3 text-xs">
          <p className="text-warning">
            El tema "{topic.title}"{subject ? ` (materia: ${subject.title})` : ""} todavía no tiene una nota
            vinculada en Obsidian.
          </p>
          <p className="mt-1 text-text-muted">
            Para vincularla, la nota necesita <code>sodiac_id: {topic.id}</code> en su frontmatter — o creá una
            nueva ahora mismo con ese vínculo ya puesto.
          </p>
          {createNoteError && <p className="mt-1 text-danger">{createNoteError}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void handleCreateNoteForTopic()}
              disabled={creatingNote}
              className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              {creatingNote ? "Creando…" : "Crear nota ahora"}
            </button>
            <button
              onClick={() => setShowMissingNoteInfo(false)}
              className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
            >
              Cerrar
            </button>
          </div>
        </div>
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

            {(relatedTask || topic || subject) && (
              <div className="space-y-2 rounded border border-border-subtle bg-background/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Marcar como completado
                </p>
                {relatedTask && (
                  <label className="flex items-center justify-between gap-2 text-sm text-text-secondary">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={completeTaskChecked}
                        onChange={(e) => setCompleteTaskChecked(e.target.checked)}
                      />
                      Tarea: {relatedTask.title}
                    </span>
                    <span className="text-xs text-accent">+{Math.round(taskXpPreview)} XP</span>
                  </label>
                )}
                {topic && !topic.completed_at && (
                  <label className="flex items-center justify-between gap-2 text-sm text-text-secondary">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={completeTopicChecked}
                        onChange={(e) => setCompleteTopicChecked(e.target.checked)}
                      />
                      Tema: {topic.title}
                    </span>
                    <span className="text-xs text-accent">+{Math.round(topicXpPreview)} XP</span>
                  </label>
                )}
                {subject && (
                  <label
                    className={`flex items-center justify-between gap-2 text-sm ${subjectGate?.eligible ? "text-text-secondary" : "text-text-muted"}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={completeSubjectChecked}
                        disabled={!subjectGate?.eligible}
                        onChange={(e) => setCompleteSubjectChecked(e.target.checked)}
                      />
                      Materia: {subject.title}
                    </span>
                    <span className="text-xs text-accent">
                      {subjectGate?.eligible
                        ? `+${Math.round(subjectXpPreview)} XP`
                        : `${subjectGate?.pendingTopicCount ?? 0} tema(s) pendiente(s)`}
                    </span>
                  </label>
                )}
                <p className="text-right text-xs font-semibold text-text-primary">
                  Total a recibir: +
                  {Math.round(
                    (completeTaskChecked ? taskXpPreview : 0) +
                      (completeTopicChecked ? topicXpPreview : 0) +
                      (completeSubjectChecked ? subjectXpPreview : 0),
                  )}{" "}
                  XP
                </p>
              </div>
            )}

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
            {masteryLevel !== "" && (
              <Field label="Nota externa (0-10, opcional — ej. una evaluación de ChatGPT)">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={externalScore}
                  onChange={(e) => setExternalScore(e.target.value)}
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                {draftStatus === "guardando" && "Guardando…"}
                {draftStatus === "guardado" &&
                  `Guardado${draftSavedAt ? ` · ${draftSavedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
                {draftStatus === "error" && <span className="text-danger">Error al guardar el borrador</span>}
              </p>
              <button
                type="submit"
                disabled={finalizing}
                className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent disabled:opacity-40"
              >
                {finalizing ? "Cerrando…" : "Cerrar sesión"}
              </button>
            </div>
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
