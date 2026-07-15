/** Campos comunes a la mayoría de las tablas académicas (docs/DATA_MODEL.md). */
export interface BaseRow {
  id: string;
  status: string;
  sort_order: number;
  notes: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface FundamentalQuestionRow extends BaseRow {
  code: string;
  title: string;
  description: string | null;
}

export interface CompetencyRow extends BaseRow {
  fundamental_question_id: string | null;
  code: string;
  title: string;
  description: string | null;
  level_group: number;
  evidence_hint: string | null;
}

export interface LearningStageRow extends BaseRow {
  code: string;
  title: string;
  description: string | null;
  orientative_duration: string | null;
  main_product: string | null;
}

export interface SubjectRow extends BaseRow {
  fundamental_question_id: string;
  title: string;
  description: string | null;
}

export interface TopicRow extends BaseRow {
  subject_id: string;
  competency_id: string | null;
  learning_stage_id: string | null;
  title: string;
  description: string | null;
}

export interface ProjectRow extends BaseRow {
  fundamental_question_id: string | null;
  competency_id: string | null;
  subject_id: string | null;
  title: string;
  description: string | null;
  project_type: string;
  closure_conditions: string | null;
  context_type: string;
  started_at: string | null;
  closed_at: string | null;
}

export interface ProjectMilestoneRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  completed_at: string | null;
  status: string;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstitutionalDocumentRow extends BaseRow {
  code: string;
  title: string;
  doc_type: string | null;
  current_version_id: string | null;
}

export interface DocumentVersionRow {
  id: string;
  institutional_document_id: string;
  version_label: string;
  file_path: string | null;
  changelog: string | null;
  published_at: string | null;
  replaces_version_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow extends BaseRow {
  title: string;
  description: string | null;
  due_at: string | null;
  priority: "baja" | "media" | "alta" | "critica";
  task_type: "estudio" | "administrativo" | "proyecto" | "otro";
  project_id: string | null;
  study_session_id: string | null;
  completed_at: string | null;
}

export interface TaskHistoryRow {
  id: string;
  task_id: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  reason: string | null;
}

export interface DailyPlanRow {
  id: string;
  plan_date: string;
  energy_declared: number | null;
  available_minutes: number | null;
  focus_subject_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyPlanRow {
  id: string;
  week_start_date: string;
  review_type: "cada_5_sesiones" | "etapa" | "trimestral" | "extraordinaria" | null;
  accelerated_json: string | null;
  postponed_json: string | null;
  removed_json: string | null;
  added_json: string | null;
  rationale: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContinuityPointRow {
  id: string;
  study_session_id: string | null;
  topic_id: string | null;
  project_id: string | null;
  description: string;
  created_at: string;
}

export interface UserSettingRow {
  id: string;
  key: string;
  value_json: string;
  updated_at: string;
}

export interface BackupRecordRow {
  id: string;
  backup_type: string;
  file_path: string;
  size_bytes: number | null;
  checksum: string | null;
  created_at: string;
  restored_at: string | null;
  restore_result: string | null;
}

export interface ActivityLogRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload_json: string | null;
  actor: "usuario" | "sistema";
  created_at: string;
}
