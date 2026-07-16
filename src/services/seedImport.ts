import fundamentalQuestionsSeed from "../../seed/fundamental-questions.json";
import competenciesSeed from "../../seed/competencies.json";
import stagesSeed from "../../seed/stages.json";
import subjectsSeed from "../../seed/subjects.json";
import topicsSeed from "../../seed/topics.json";
import projectsSeed from "../../seed/projects.json";
import institutionalDocumentsSeed from "../../seed/institutional-documents.json";

import {
  competenciesRepo,
  documentVersionsRepo,
  fundamentalQuestionsRepo,
  institutionalDocumentsRepo,
  learningStagesRepo,
  projectMilestonesRepo,
  projectsRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  CompetencyRow,
  FundamentalQuestionRow,
  InstitutionalDocumentRow,
  LearningStageRow,
  ProjectRow,
  SubjectRow,
  TopicRow,
} from "@/database/types";
import { createRepository } from "@/database/repository";

const now = () => new Date().toISOString();

/**
 * Inserta una fila nueva solo si no existe otra con el mismo valor en
 * `codeColumn` (import idempotente — reejecutar el import no duplica la
 * estructura institucional). Devuelve el id final (nuevo o existente).
 */
async function upsertByCode<T extends { id: string }>(
  repo: ReturnType<typeof createRepository<T>>,
  codeColumn: string,
  code: string,
  build: (id: string) => T,
): Promise<{ id: string; created: boolean }> {
  const existing = await repo.list({ where: `${codeColumn} = ?`, params: [code] });
  if (existing.length > 0) {
    return { id: existing[0]!.id, created: false };
  }
  const id = crypto.randomUUID();
  await repo.insert(build(id), "sistema");
  return { id, created: true };
}

export interface SeedImportSummary {
  fundamentalQuestions: number;
  competencies: number;
  learningStages: number;
  subjects: number;
  topics: number;
  projects: number;
  institutionalDocuments: number;
  skipped: number;
}

export async function importInstitutionalSeed(): Promise<SeedImportSummary> {
  const summary: SeedImportSummary = {
    fundamentalQuestions: 0,
    competencies: 0,
    learningStages: 0,
    subjects: 0,
    topics: 0,
    projects: 0,
    institutionalDocuments: 0,
    skipped: 0,
  };

  const questionIdByCode = new Map<string, string>();
  for (const q of fundamentalQuestionsSeed) {
    const { id, created } = await upsertByCode<FundamentalQuestionRow>(
      fundamentalQuestionsRepo,
      "code",
      q.code,
      (newId) => ({
        id: newId,
        code: q.code,
        title: q.title,
        description: q.description ?? null,
        sort_order: q.sort_order ?? 0,
        status: "activa",
        notes: null,
        tags: "seed:institucional",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      }),
    );
    questionIdByCode.set(q.code, id);
    if (created) summary.fundamentalQuestions++;
    else summary.skipped++;
  }

  const stageIdByCode = new Map<string, string>();
  for (const s of stagesSeed) {
    const { id, created } = await upsertByCode<LearningStageRow>(
      learningStagesRepo,
      "code",
      s.code,
      (newId) => ({
        id: newId,
        code: s.code,
        title: s.title,
        description: null,
        orientative_duration: s.orientative_duration ?? null,
        main_product: s.main_product ?? null,
        sort_order: s.sort_order ?? 0,
        status: "activa",
        notes: null,
        tags: "seed:institucional",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      }),
    );
    stageIdByCode.set(s.code, id);
    if (created) summary.learningStages++;
    else summary.skipped++;
  }

  for (const c of competenciesSeed) {
    const fqId = c.fundamental_question_code
      ? (questionIdByCode.get(c.fundamental_question_code) ?? null)
      : null;
    const { created } = await upsertByCode<CompetencyRow>(
      competenciesRepo,
      "code",
      c.code,
      (newId) => ({
        id: newId,
        fundamental_question_id: fqId,
        code: c.code,
        title: c.title,
        description: null,
        level_group: c.level_group,
        evidence_hint: c.evidence_hint ?? null,
        sort_order: 0,
        status: "activa",
        notes: null,
        tags: "seed:institucional",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      }),
    );
    if (created) summary.competencies++;
    else summary.skipped++;
  }

  const subjectIdByCode = new Map<string, string>();
  for (const s of subjectsSeed) {
    const fqId = questionIdByCode.get(s.fundamental_question_code) ?? null;
    if (!fqId) continue;
    const { id, created } = await upsertByCode<SubjectRow>(
      subjectsRepo,
      "title",
      s.title,
      (newId) => ({
        id: newId,
        fundamental_question_id: fqId,
        title: s.title,
        description: s.description ?? null,
        sort_order: 0,
        status: "activa",
        notes: null,
        tags: "seed:institucional",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
        credits: 3,
        complexity: 3,
        importance: 3,
        estimated_load: 3,
        is_mandatory: 1,
        budgeted_xp: null,
        completed_at: null,
        completion_budgeted_xp: null,
        learning_stage_id: null,
        career_id: null,
      }),
    );
    subjectIdByCode.set(s.code, id);
    if (created) summary.subjects++;
    else summary.skipped++;
  }

  for (const t of topicsSeed) {
    const subjectId = subjectIdByCode.get(t.subject_code);
    if (!subjectId) continue;
    const stageId = t.learning_stage_code ? (stageIdByCode.get(t.learning_stage_code) ?? null) : null;
    const { created } = await upsertByCode<TopicRow>(
      topicsRepo,
      "title",
      t.title,
      (newId) => ({
        id: newId,
        subject_id: subjectId,
        competency_id: null,
        learning_stage_id: stageId,
        title: t.title,
        description: null,
        completed_at: null,
        curriculum_unit_id: null,
        sort_order: 0,
        status: "activo",
        notes: null,
        tags: "seed:institucional",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      }),
    );
    if (created) summary.topics++;
    else summary.skipped++;
  }

  for (const p of projectsSeed) {
    const fqId = p.fundamental_question_code ? (questionIdByCode.get(p.fundamental_question_code) ?? null) : null;
    const subjectId = p.subject_code ? (subjectIdByCode.get(p.subject_code) ?? null) : null;
    const { id: projectId, created } = await upsertByCode<ProjectRow>(
      projectsRepo,
      "title",
      p.title,
      (newId) => ({
        id: newId,
        fundamental_question_id: fqId,
        competency_id: null,
        subject_id: subjectId,
        title: p.title,
        description: p.description ?? null,
        project_type: p.project_type,
        closure_conditions: p.closure_conditions ?? null,
        context_type: p.context_type,
        started_at: null,
        closed_at: null,
        sort_order: 0,
        status: "activo",
        notes: null,
        tags: "seed:institucional",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      }),
    );
    if (created) {
      summary.projects++;
      let order = 0;
      for (const m of p.milestones ?? []) {
        await projectMilestonesRepo.insert(
          {
            id: crypto.randomUUID(),
            project_id: projectId,
            title: m.title,
            description: null,
            due_at: null,
            completed_at: null,
            status: "pendiente",
            sort_order: order++,
            notes: null,
            created_at: now(),
            updated_at: now(),
          },
          "sistema",
        );
      }
    } else {
      summary.skipped++;
    }
  }

  for (const d of institutionalDocumentsSeed) {
    const { id: docId, created } = await upsertByCode<InstitutionalDocumentRow>(
      institutionalDocumentsRepo,
      "code",
      d.code,
      (newId) => ({
        id: newId,
        code: d.code,
        title: d.title,
        doc_type: d.doc_type ?? null,
        current_version_id: null,
        sort_order: 0,
        status: d.status ?? "borrador",
        notes: null,
        tags: "seed:institucional",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      }),
    );
    if (created) {
      summary.institutionalDocuments++;
      const versionId = crypto.randomUUID();
      await documentVersionsRepo.insert(
        {
          id: versionId,
          institutional_document_id: docId,
          version_label: d.version_label,
          file_path: null,
          changelog: "Importado desde seed institucional.",
          published_at: d.status === "publicado" ? now() : null,
          replaces_version_id: null,
          status: d.status ?? "borrador",
          created_at: now(),
          updated_at: now(),
          source_document_id: null,
          start_page: null,
          end_page: null,
        },
        "sistema",
      );
      await institutionalDocumentsRepo.update(docId, { current_version_id: versionId }, "sistema");
    } else {
      summary.skipped++;
    }
  }

  return summary;
}
