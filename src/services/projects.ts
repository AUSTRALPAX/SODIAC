import { projectMilestonesRepo, projectsRepo } from "@/database/entities";
import type { ProjectMilestoneRow, ProjectRow } from "@/database/types";

const now = () => new Date().toISOString();

export interface NewProjectInput {
  title: string;
  description?: string | null;
  project_type: string;
  context_type: ProjectRow["context_type"];
  fundamental_question_id?: string | null;
  subject_id?: string | null;
  closure_conditions?: string | null;
}

export async function createProject(input: NewProjectInput): Promise<ProjectRow> {
  const row: ProjectRow = {
    id: crypto.randomUUID(),
    fundamental_question_id: input.fundamental_question_id ?? null,
    competency_id: null,
    subject_id: input.subject_id ?? null,
    title: input.title,
    description: input.description ?? null,
    project_type: input.project_type,
    closure_conditions: input.closure_conditions ?? null,
    context_type: input.context_type,
    started_at: now(),
    closed_at: null,
    sort_order: 0,
    status: "activo",
    notes: null,
    tags: null,
    created_at: now(),
    updated_at: now(),
    archived_at: null,
  };
  return projectsRepo.insert(row);
}

export async function listProjects(): Promise<ProjectRow[]> {
  return projectsRepo.list({ where: "archived_at IS NULL", orderBy: "closed_at IS NOT NULL, created_at DESC" });
}

export async function listMilestones(projectId: string): Promise<ProjectMilestoneRow[]> {
  return projectMilestonesRepo.list({ where: "project_id = ?", params: [projectId], orderBy: "sort_order" });
}

export async function toggleMilestone(milestone: ProjectMilestoneRow): Promise<void> {
  if (milestone.status === "completado") {
    await projectMilestonesRepo.update(milestone.id, { status: "pendiente", completed_at: null });
  } else {
    await projectMilestonesRepo.update(milestone.id, { status: "completado", completed_at: now() });
  }
}

export async function closeProject(id: string): Promise<void> {
  await projectsRepo.update(id, { closed_at: now(), status: "cerrado" });
}

export async function reopenProject(id: string): Promise<void> {
  await projectsRepo.update(id, { closed_at: null, status: "activo" });
}
