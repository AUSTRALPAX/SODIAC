import { academicAssignmentsRepo, assignmentSubmissionsRepo } from "@/database/entities";
import type { AcademicAssignmentRow, AssignmentStatus, AssignmentSubmissionRow } from "@/database/types";

const now = () => new Date().toISOString();

export interface NewAssignmentInput {
  title: string;
  workType: string;
  subjectId?: string | null;
  topicId?: string | null;
  competencyId?: string | null;
  fundamentalQuestionId?: string | null;
  prompt?: string | null;
  rubricVersionId?: string | null;
}

export async function createAssignment(input: NewAssignmentInput): Promise<AcademicAssignmentRow> {
  const row: AcademicAssignmentRow = {
    id: crypto.randomUUID(),
    title: input.title,
    work_type: input.workType,
    subject_id: input.subjectId ?? null,
    topic_id: input.topicId ?? null,
    competency_id: input.competencyId ?? null,
    fundamental_question_id: input.fundamentalQuestionId ?? null,
    prompt: input.prompt ?? null,
    rubric_version_id: input.rubricVersionId ?? null,
    status: "borrador",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: now(),
    updated_at: now(),
    archived_at: null,
  };
  await academicAssignmentsRepo.insert(row);
  return row;
}

export async function listAssignments(): Promise<AcademicAssignmentRow[]> {
  return academicAssignmentsRepo.list({ where: "archived_at IS NULL", orderBy: "created_at DESC" });
}

export async function listAssignmentsBySubject(subjectId: string): Promise<AcademicAssignmentRow[]> {
  return academicAssignmentsRepo.list({
    where: "archived_at IS NULL AND subject_id = ?",
    params: [subjectId],
    orderBy: "created_at DESC",
  });
}

export async function setAssignmentStatus(assignmentId: string, status: AssignmentStatus): Promise<void> {
  await academicAssignmentsRepo.update(assignmentId, { status });
}

export interface SubmitWorkInput {
  content?: string | null;
  filePath?: string | null;
  obsidianNoteId?: string | null;
}

export async function submitWork(assignmentId: string, input: SubmitWorkInput): Promise<AssignmentSubmissionRow> {
  const previous = await assignmentSubmissionsRepo.list({
    where: "assignment_id = ?",
    params: [assignmentId],
    orderBy: "version DESC",
  });
  for (const p of previous) {
    if (p.status === "entregado") await assignmentSubmissionsRepo.update(p.id, { status: "reemplazado" });
  }

  const workText = input.content ?? input.filePath ?? "";
  const workHash = await sha256Hex(workText);

  const row: AssignmentSubmissionRow = {
    id: crypto.randomUUID(),
    assignment_id: assignmentId,
    version: (previous[0]?.version ?? 0) + 1,
    content: input.content ?? null,
    file_path: input.filePath ?? null,
    obsidian_note_id: input.obsidianNoteId ?? null,
    work_hash: workHash,
    submitted_at: now(),
    status: "entregado",
    updated_at: now(),
  };
  await assignmentSubmissionsRepo.insert(row);
  await setAssignmentStatus(assignmentId, "listo_para_evaluar");
  return row;
}

export async function listSubmissions(assignmentId: string): Promise<AssignmentSubmissionRow[]> {
  return assignmentSubmissionsRepo.list({
    where: "assignment_id = ?",
    params: [assignmentId],
    orderBy: "version DESC",
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
