import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  competenciesRepo,
  fundamentalQuestionsRepo,
  subjectsRepo,
  tasksRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  CompetencyRow,
  FundamentalQuestionRow,
  SessionType,
  SubjectRow,
  TopicRow,
} from "@/database/types";
import { generateChatGptPrompt, scheduleSession, startSession, type StartSessionInput } from "@/services/sessions";
import { createTask } from "@/services/tasks";
import { getVaultPath, openVaultInObsidian } from "@/services/obsidian";

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: "explicacion", label: "Explicación" },
  { value: "debate", label: "Debate" },
  { value: "lectura", label: "Lectura" },
  { value: "ejercicio", label: "Ejercicio" },
  { value: "laboratorio", label: "Laboratorio" },
  { value: "revision", label: "Revisión" },
  { value: "aplicacion", label: "Aplicación" },
  { value: "produccion_escrita", label: "Producción escrita" },
  { value: "diagnostico", label: "Diagnóstico" },
];

const CHATGPT_URL = "https://chat.openai.com";

export function StartSessionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get("taskId");

  const [questions, setQuestions] = useState<FundamentalQuestionRow[]>([]);
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);

  const [fundamentalQuestionId, setFundamentalQuestionId] = useState("");
  const [competencyId, setCompetencyId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("explicacion");
  const [plannedMinutes, setPlannedMinutes] = useState("45");
  const [priorKnowledge, setPriorKnowledge] = useState("");
  const [objective, setObjective] = useState("");
  const [resources, setResources] = useState("");
  const [expectedProduct, setExpectedProduct] = useState("");

  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [vaultConfigured, setVaultConfigured] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [obsidianError, setObsidianError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fundamentalQuestionsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      competenciesRepo.list({ where: "archived_at IS NULL AND origin = 'curriculum'", orderBy: "code" }),
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      topicsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      getVaultPath(),
    ]).then(([q, c, s, t, vault]) => {
      setQuestions(q);
      setCompetencies(c);
      setSubjects(s);
      setTopics(t);
      setVaultConfigured(vault !== null);

      const paramQuestion = searchParams.get("fundamentalQuestionId");
      const paramCompetency = searchParams.get("competencyId");
      const paramSubject = searchParams.get("subjectId");
      const paramTopic = searchParams.get("topicId");
      const paramObjective = searchParams.get("objective");
      if (paramQuestion) setFundamentalQuestionId(paramQuestion);
      if (paramCompetency) setCompetencyId(paramCompetency);
      if (paramSubject) setSubjectId(paramSubject);
      if (paramTopic) setTopicId(paramTopic);
      if (paramObjective) setObjective(paramObjective);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCompetencies = useMemo(
    () =>
      fundamentalQuestionId
        ? competencies.filter((c) => c.fundamental_question_id === fundamentalQuestionId)
        : competencies,
    [competencies, fundamentalQuestionId],
  );
  const filteredSubjects = useMemo(
    () =>
      fundamentalQuestionId
        ? subjects.filter((s) => s.fundamental_question_id === fundamentalQuestionId)
        : subjects,
    [subjects, fundamentalQuestionId],
  );
  const filteredTopics = useMemo(
    () => (subjectId ? topics.filter((t) => t.subject_id === subjectId) : topics),
    [topics, subjectId],
  );

  function currentInput(): StartSessionInput {
    return {
      fundamental_question_id: fundamentalQuestionId || null,
      competency_id: competencyId || null,
      subject_id: subjectId || null,
      topic_id: topicId || null,
      session_type: sessionType,
      planned_duration_min: plannedMinutes ? Number(plannedMinutes) : null,
      prior_knowledge: priorKnowledge || null,
      observable_objective: objective,
      resources: resources || null,
      expected_product: expectedProduct || null,
    };
  }

  async function handleCopyPrompt() {
    const prompt = await generateChatGptPrompt(currentInput());
    await navigator.clipboard.writeText(prompt);
    setCopyMessage("Prompt copiado al portapapeles.");
    setTimeout(() => setCopyMessage(null), 3000);
  }

  async function handleOpenChatGpt() {
    await openUrl(CHATGPT_URL);
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    if (!objective.trim()) return;
    setStarting(true);
    try {
      const session = await startSession(currentInput());
      if (taskId) await tasksRepo.update(taskId, { study_session_id: session.id });
      navigate(`/sesiones/${session.id}`);
    } finally {
      setStarting(false);
    }
  }

  async function handleSchedule() {
    if (!objective.trim() || !scheduleAt) return;
    setScheduling(true);
    try {
      const session = await scheduleSession(currentInput(), new Date(scheduleAt).toISOString());
      if (taskId) await tasksRepo.update(taskId, { study_session_id: session.id });
      navigate("/sesiones");
    } finally {
      setScheduling(false);
    }
  }

  async function handleSaveAsPlan() {
    if (!objective.trim()) return;
    setSavingPlan(true);
    try {
      await createTask({
        title: objective,
        description: "Guardado desde INICIAR ESTUDIO como planificación (todavía sin comenzar).",
        task_type: "estudio",
      });
      navigate("/planificacion");
    } finally {
      setSavingPlan(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-10">
      <Breadcrumb items={[{ label: "Sesiones", to: "/sesiones" }, { label: "Iniciar estudio" }]} />
      <h1 className="mt-3 font-display text-2xl">Iniciar estudio</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Protocolo INICIAR ESTUDIO — ubica la sesión en el sistema antes de empezar.
      </p>

      <form onSubmit={handleStart} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pregunta fundamental">
            <select
              value={fundamentalQuestionId}
              onChange={(e) => {
                setFundamentalQuestionId(e.target.value);
                setCompetencyId("");
                setSubjectId("");
                setTopicId("");
              }}
              className={selectClass}
            >
              <option value="">—</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Competencia">
            <select value={competencyId} onChange={(e) => setCompetencyId(e.target.value)} className={selectClass}>
              <option value="">—</option>
              {filteredCompetencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Materia">
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTopicId("");
              }}
              className={selectClass}
            >
              <option value="">—</option>
              {filteredSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tema">
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={selectClass}>
              <option value="">—</option>
              {filteredTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de sesión">
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
              className={selectClass}
            >
              {SESSION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duración disponible (min)">
            <input
              type="number"
              min={5}
              value={plannedMinutes}
              onChange={(e) => setPlannedMinutes(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Conocimiento previo — qué sé, qué creo saber, qué falta">
          <textarea value={priorKnowledge} onChange={(e) => setPriorKnowledge(e.target.value)} rows={3} className={inputClass} />
        </Field>

        <Field label="Objetivo observable *" required>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={2}
            placeholder='Ej: "Poder explicar qué información transmite un precio y qué no puede inferirse de él."'
            className={inputClass}
            required
          />
        </Field>

        <Field label="Recursos">
          <textarea value={resources} onChange={(e) => setResources(e.target.value)} rows={2} className={inputClass} />
        </Field>

        <Field label="Producto esperado">
          <textarea
            value={expectedProduct}
            onChange={(e) => setExpectedProduct(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </Field>

        <div className="flex flex-wrap items-end gap-2 pt-2">
          <button
            type="submit"
            disabled={starting || !objective.trim()}
            className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium uppercase tracking-wide text-accent disabled:opacity-40"
          >
            {starting ? "Iniciando…" : "Comenzar sesión"}
          </button>
          <Field label="Programar para">
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className={inputClass}
            />
          </Field>
          <button
            type="button"
            onClick={handleSchedule}
            disabled={scheduling || !objective.trim() || !scheduleAt}
            className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {scheduling ? "Programando…" : "Programar sesión"}
          </button>
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            Copiar prompt para ChatGPT
          </button>
          <button
            type="button"
            onClick={handleOpenChatGpt}
            className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            Abrir ChatGPT
          </button>
          <button
            type="button"
            disabled={!vaultConfigured}
            title={vaultConfigured ? undefined : "Configurá el vault en Obsidian primero"}
            onClick={async () => {
              setObsidianError(null);
              const result = await openVaultInObsidian();
              if (!result.success) setObsidianError(result.error ?? "No se pudo abrir Obsidian.");
            }}
            className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:text-text-muted disabled:opacity-50"
          >
            Abrir vault en Obsidian
          </button>
          <button
            type="button"
            onClick={handleSaveAsPlan}
            disabled={savingPlan || !objective.trim()}
            className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {savingPlan ? "Guardando…" : "Guardar como planificación"}
          </button>
        </div>
        {copyMessage && <p className="text-xs text-success">{copyMessage}</p>}
        {obsidianError && (
          <p className="text-xs text-danger">
            No se pudo abrir Obsidian: {obsidianError}. Verificá la integración en Configuración → Obsidian.
          </p>
        )}
      </form>
    </div>
  );
}

const selectClass =
  "w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none";
const inputClass =
  "w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none";

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
