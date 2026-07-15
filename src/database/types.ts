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

export interface CurriculumDependencyRow {
  id: string;
  from_topic_id: string;
  to_topic_id: string;
  dependency_type: "requires" | "suggests";
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export type SessionType =
  | "explicacion"
  | "debate"
  | "lectura"
  | "ejercicio"
  | "laboratorio"
  | "revision"
  | "aplicacion"
  | "produccion_escrita"
  | "diagnostico";

export interface StudySessionRow extends BaseRow {
  fundamental_question_id: string | null;
  competency_id: string | null;
  subject_id: string | null;
  topic_id: string | null;
  session_type: SessionType;
  planned_duration_min: number | null;
  actual_duration_min: number | null;
  prior_knowledge: string | null;
  observable_objective: string | null;
  resources: string | null;
  expected_product: string | null;
  continuity_point_prev_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  closure_status: "en_curso" | "formal" | "cancelada" | "incompleta";
  conclusion: string | null;
  evidence_summary: string | null;
  next_action: string | null;
  continuity_point: string | null;
}

export interface StudyBlockRow {
  id: string;
  study_session_id: string;
  block_type: "comprension" | "aplicacion" | "consolidacion";
  started_at: string | null;
  ended_at: string | null;
  quick_notes: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PomodoroCycleRow {
  id: string;
  study_session_id: string;
  cycle_index: number;
  phase: "foco" | "pausa_corta" | "pausa_larga";
  planned_minutes: number;
  actual_minutes: number | null;
  interrupted: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningEvidenceRow extends BaseRow {
  study_session_id: string | null;
  project_id: string | null;
  evidence_type: string;
  title: string;
  description: string | null;
  file_path: string | null;
  obsidian_note_id: string | null;
}

export interface MasteryAssessmentRow {
  id: string;
  competency_id: string;
  topic_id: string | null;
  level: number;
  assessed_at: string;
  declared_confidence: number | null;
  perceived_difficulty: number | null;
  result_explanation: string | null;
  evidence_id: string | null;
  evaluator: "fundador" | "chatgpt" | "sodiac_heuristica";
  is_provisional: number;
  next_advance_criterion: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewRow extends BaseRow {
  competency_id: string | null;
  topic_id: string | null;
  evidence_id: string | null;
  due_at: string | null;
  state:
    | "no_programado"
    | "proximo"
    | "pendiente"
    | "vencido"
    | "completado"
    | "pospuesto"
    | "innecesario"
    | "enfriado";
  reason_factors: string | null;
  completed_at: string | null;
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

export interface ObsidianNoteRow {
  id: string;
  vault_relative_path: string;
  title: string | null;
  frontmatter_json: string | null;
  indexed_at: string;
  checksum: string | null;
  sodiac_id: string | null;
  note_type: string | null;
  status: string | null;
  mastery_level: number | null;
  last_review_at: string | null;
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteLinkRow {
  id: string;
  source_note_id: string;
  target_note_path: string;
  link_type: "wikilink" | "embed";
  created_at: string;
}

export type ObsidianPermissionMode =
  | "solo_lectura"
  | "lectura_creacion"
  | "lectura_creacion_actualizacion_metadatos";

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
