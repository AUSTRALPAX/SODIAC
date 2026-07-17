import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useViewPreference } from "@/hooks/useViewPreference";
import { PROJECTS_VIEW_DEFAULTS, projectsViewPreferenceSchema } from "@/schemas/viewPreferences";
import { projectMilestonesRepo } from "@/database/entities";
import type { ProjectMilestoneRow, ProjectRow } from "@/database/types";
import {
  closeProject,
  createProject,
  listMilestones,
  listProjects,
  reopenProject,
  toggleMilestone,
} from "@/services/projects";

const PROJECT_TYPES = [
  "analisis",
  "simulacion",
  "modelo",
  "planilla",
  "software",
  "ensayo",
  "capitulo",
  "protocolo",
  "estudio_de_caso",
  "politica",
  "laboratorio",
];

const CONTEXT_TYPES: { value: ProjectRow["context_type"]; label: string }[] = [
  { value: "estudio", label: "Estudio" },
  { value: "laboratorio", label: "Laboratorio" },
  { value: "simulacion", label: "Simulación" },
  { value: "cartera_real", label: "Cartera real" },
  { value: "produccion_editorial", label: "Producción editorial" },
];

const CONTEXT_COLOR: Record<ProjectRow["context_type"], string> = {
  estudio: "text-text-secondary",
  laboratorio: "text-accent",
  simulacion: "text-warning",
  cartera_real: "text-danger",
  produccion_editorial: "text-success",
};

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const { value: viewPrefs, update: updateViewPrefs, loaded: prefsLoaded } = useViewPreference(
    "projects",
    projectsViewPreferenceSchema,
    PROJECTS_VIEW_DEFAULTS,
  );
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [initializedSelection, setInitializedSelection] = useState(false);
  const [milestones, setMilestones] = useState<ProjectMilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);

  function setSelectedId(id: string | null) {
    setSelectedIdState(id);
    updateViewPrefs({ selectedId: id }, { immediate: true });
  }

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState(PROJECT_TYPES[0]!);
  const [contextType, setContextType] = useState<ProjectRow["context_type"]>("estudio");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listProjects();
    setProjects(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Espera a que carguen tanto los proyectos como la preferencia guardada
  // antes de decidir: si la selección persistida sigue existiendo, se
  // restaura; si no, se cae al primer proyecto (comportamiento previo).
  useEffect(() => {
    if (initializedSelection || !prefsLoaded || projects.length === 0) return;
    const persisted = viewPrefs.selectedId;
    if (persisted && projects.some((p) => p.id === persisted)) {
      setSelectedIdState(persisted);
    } else {
      setSelectedId(projects[0]!.id);
    }
    setInitializedSelection(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializedSelection, prefsLoaded, projects, viewPrefs.selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMilestones([]);
      return;
    }
    void listMilestones(selectedId).then(setMilestones);
  }, [selectedId]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const project = await createProject({
        title: title.trim(),
        description: description || null,
        project_type: projectType,
        context_type: contextType,
      });
      setTitle("");
      setDescription("");
      setShowCreate(false);
      await refresh();
      setSelectedId(project.id);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleMilestone(m: ProjectMilestoneRow) {
    await toggleMilestone(m);
    if (selectedId) setMilestones(await listMilestones(selectedId));
  }

  async function handleAddMilestone(projectId: string, milestoneTitle: string) {
    if (!milestoneTitle.trim()) return;
    await projectMilestonesRepo.insert({
      id: crypto.randomUUID(),
      project_id: projectId,
      title: milestoneTitle.trim(),
      description: null,
      due_at: null,
      completed_at: null,
      status: "pendiente",
      sort_order: milestones.length,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setMilestones(await listMilestones(projectId));
  }

  async function handleToggleClose(project: ProjectRow) {
    if (project.closed_at) {
      await reopenProject(project.id);
    } else {
      await closeProject(project.id);
    }
    await refresh();
  }

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="grid h-full grid-cols-1 gap-6 overflow-y-auto p-8 lg:grid-cols-[320px_1fr]">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl">Proyectos</h1>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent"
          >
            Nuevo
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="mt-3 space-y-2 rounded border border-border-subtle bg-surface p-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción"
              rows={2}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select
              value={contextType}
              onChange={(e) => setContextType(e.target.value as ProjectRow["context_type"])}
              className="w-full rounded border border-border bg-background px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {CONTEXT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="w-full rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              {creating ? "Creando…" : "Crear proyecto"}
            </button>
          </form>
        )}

        <ul className="mt-4 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {projects.length === 0 && <li className="p-4 text-sm text-text-muted">Sin proyectos todavía.</li>}
          {projects.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelectedId(p.id)}
                className={`block w-full px-3 py-2.5 text-left text-sm ${
                  selectedId === p.id ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:bg-surface-hover"
                }`}
              >
                <span className={p.closed_at ? "text-text-muted line-through" : ""}>{p.title}</span>
                <div className={`mt-0.5 text-xs ${CONTEXT_COLOR[p.context_type]}`}>
                  {p.project_type.replace(/_/g, " ")} · {CONTEXT_TYPES.find((c) => c.value === p.context_type)?.label}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {!selected ? (
          <p className="text-sm text-text-muted">Elegí un proyecto para ver el detalle.</p>
        ) : (
          <ProjectDetail
            project={selected}
            milestones={milestones}
            onToggleMilestone={handleToggleMilestone}
            onAddMilestone={(t) => handleAddMilestone(selected.id, t)}
            onToggleClose={() => handleToggleClose(selected)}
          />
        )}
      </div>
    </div>
  );
}

function ProjectDetail({
  project,
  milestones,
  onToggleMilestone,
  onAddMilestone,
  onToggleClose,
}: {
  project: ProjectRow;
  milestones: ProjectMilestoneRow[];
  onToggleMilestone: (m: ProjectMilestoneRow) => void;
  onAddMilestone: (title: string) => void;
  onToggleClose: () => void;
}) {
  const [newMilestone, setNewMilestone] = useState("");
  const done = milestones.filter((m) => m.status === "completado").length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">{project.title}</h2>
          {project.description && <p className="mt-1 text-sm text-text-secondary">{project.description}</p>}
          <p className={`mt-1 text-xs uppercase tracking-wide ${CONTEXT_COLOR[project.context_type]}`}>
            {project.project_type.replace(/_/g, " ")} ·{" "}
            {CONTEXT_TYPES.find((c) => c.value === project.context_type)?.label}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!project.closed_at && (
            <Link
              to={`/sesiones/nueva?${new URLSearchParams({
                objective: `Trabajar en proyecto: ${project.title}`,
              }).toString()}`}
              className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent"
            >
              Iniciar sesión
            </Link>
          )}
          <button
            onClick={onToggleClose}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
          >
            {project.closed_at ? "Reabrir" : "Cerrar proyecto"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Hitos ({done}/{milestones.length})
          </h3>
        </div>
        <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {milestones.length === 0 && <li className="p-3 text-sm text-text-muted">Sin hitos todavía.</li>}
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className={m.status === "completado" ? "text-text-muted line-through" : "text-text-primary"}>
                {m.title}
              </span>
              <button
                onClick={() => onToggleMilestone(m)}
                className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-success hover:text-success"
              >
                {m.status === "completado" ? "Reabrir" : "Completar"}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            value={newMilestone}
            onChange={(e) => setNewMilestone(e.target.value)}
            placeholder="Nuevo hito…"
            className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => {
              onAddMilestone(newMilestone);
              setNewMilestone("");
            }}
            className="rounded border border-border px-3 py-2 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
