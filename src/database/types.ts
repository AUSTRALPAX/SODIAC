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
  /** ID nativo del vault (p. ej. "PF-01"), null/ausente si la fila no viene de Obsidian. */
  external_ref?: string | null;
}

/**
 * `origin` distingue dos conceptos que conviven en esta tabla (Fase I/J,
 * ver docs/MASTER_SCHEDULE_MAP_AUDIT.md §5): "legacy" son los micro-objetivos
 * de rúbrica de una fase anterior (códigos A5.1/E2.1/F0.1…, sin ningún uso
 * real hoy); "curriculum" son las competencias reales del currículo,
 * importadas desde el vault (COMP-01..10).
 */
export interface CompetencyRow extends BaseRow {
  fundamental_question_id: string | null;
  code: string;
  title: string;
  description: string | null;
  level_group: number;
  evidence_hint: string | null;
  origin?: "legacy" | "curriculum";
  external_ref?: string | null;
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
  credits: number;
  complexity: number;
  importance: number;
  estimated_load: number;
  is_mandatory: number;
  budgeted_xp: number | null;
  completed_at: string | null;
  completion_budgeted_xp: number | null;
  learning_stage_id: string | null;
  career_id: string | null;
  /** ID nativo del vault (p. ej. "MAT-01"), null/ausente si la fila no viene de Obsidian. */
  external_ref?: string | null;
}

export interface CareerRow extends BaseRow {
  title: string;
  version_label: string;
  source_document_path: string | null;
  imported_at: string | null;
  total_xp_budget: number | null;
}

export interface CurriculumUnitRow extends BaseRow {
  subject_id: string;
  title: string;
  description: string | null;
  budgeted_xp: number | null;
}

export interface CurriculumActivityRow extends BaseRow {
  topic_id: string;
  title: string;
  activity_type: string;
  estimated_minutes: number | null;
  scheduled_date: string | null;
  completed_at: string | null;
}

export interface TopicRow extends BaseRow {
  subject_id: string;
  competency_id: string | null;
  learning_stage_id: string | null;
  curriculum_unit_id: string | null;
  title: string;
  description: string | null;
  completed_at: string | null;
  /** ID nativo del vault (p. ej. "T-01.01"), null/ausente si la fila no viene de Obsidian. */
  external_ref?: string | null;
}

/** Vínculos secundarios (sección 19): la relación jerárquica primaria sigue
 * siendo subject.fundamental_question_id / topic.competency_id; estas tablas
 * guardan el resto de preguntas/competencias que una materia o tema declare. */
export interface SubjectFundamentalQuestionRow {
  id: string;
  subject_id: string;
  fundamental_question_id: string;
  created_at: string;
}

export interface SubjectCompetencyRow {
  id: string;
  subject_id: string;
  competency_id: string;
  created_at: string;
}

export interface TopicFundamentalQuestionRow {
  id: string;
  topic_id: string;
  fundamental_question_id: string;
  created_at: string;
}

export interface TopicCompetencyRow {
  id: string;
  topic_id: string;
  competency_id: string;
  created_at: string;
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
  source_document_id: string | null;
  start_page: number | null;
  end_page: number | null;
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
  subject_id: string | null;
  topic_id: string | null;
  milestone_id: string | null;
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

export interface ResourceRow extends BaseRow {
  title: string;
  resource_type:
    | "libro"
    | "articulo"
    | "informe"
    | "video"
    | "curso"
    | "sitio"
    | "dataset"
    | "documento_interno"
    | "archivo_local";
  author: string | null;
  function_note: "estructural" | "didactica" | "tecnica" | "caso" | "critica" | "referencia" | null;
  reading_state:
    | "pendiente"
    | "consultando"
    | "activo"
    | "finalizado"
    | "referencia"
    | "descartado"
    | "reemplazado";
  priority: string | null;
  file_path: string | null;
  url: string | null;
  area: string | null;
  evaluation_state: string | null;
  catalog_number: number | null;
  original_year: number | null;
  category: string | null;
  access_label: string | null;
  access_type:
    | "pdf_legal"
    | "texto_legal"
    | "pdf_texto_legal"
    | "acceso_institucional"
    | "catalogo_legal"
    | "autor_editorial"
    | "editorial"
    | "acceso_legal"
    | "sin_url_verificada"
    | null;
  source_document: string | null;
  source_page: number | null;
  import_batch: string | null;
}

export type BibliographicRelationType =
  | "bibliografia_principal"
  | "bibliografia_obligatoria"
  | "bibliografia_complementaria"
  | "referencia"
  | "profundizacion"
  | "aplicacion"
  | "consulta_tecnica"
  | "fuente_historica"
  | "lectura_opcional"
  | "prerequisito"
  | "utilizada_en_proyecto"
  | "citada"
  | "descartada";

export interface BibliographicSourceRow {
  id: string;
  resource_id: string;
  fundamental_question_id: string | null;
  competency_id: string | null;
  subject_id: string | null;
  topic_id: string | null;
  project_id: string | null;
  study_session_id: string | null;
  obsidian_note_id: string | null;
  curriculum_unit_id: string | null;
  relation_type: BibliographicRelationType | null;
  importance: number | null;
  reading_order: number | null;
  suggested_chapters: string | null;
  notes: string | null;
  linked_at: string | null;
  created_at: string;
}

export interface ResourceUsageEventRow {
  id: string;
  resource_id: string;
  session_id: string | null;
  subject_id: string | null;
  topic_id: string | null;
  project_id: string | null;
  note_id: string | null;
  action: "abierto" | "consultado" | "vinculado" | "citado" | "utilizado_en_sesion" | "utilizado_en_proyecto";
  occurred_at: string;
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
  sync_state: "sincronizada" | "pendiente" | "conflicto" | "no_encontrada" | "error" | "solo_lectura";
  last_synced_at: string | null;
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

// --- Sistema académico de calificaciones, XP, niveles y rangos --------------------------

export interface GradingRubricRow {
  id: string;
  title: string;
  work_type: string;
  description: string | null;
  current_version_id: string | null;
  status: "activa" | "archivada";
  created_at: string;
  updated_at: string;
}

export interface GradingRubricVersionRow {
  id: string;
  rubric_id: string;
  version_label: string;
  total_points: number;
  changelog: string | null;
  status: "activa" | "reemplazada" | "archivada";
  replaces_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RubricCriterionRow {
  id: string;
  rubric_version_id: string;
  code: string;
  title: string;
  description: string | null;
  weight_points: number;
  sort_order: number;
}

export type AssignmentStatus =
  | "borrador"
  | "listo_para_evaluar"
  | "evaluacion_pendiente"
  | "evaluado"
  | "aceptado"
  | "revision_solicitada"
  | "reevaluado"
  | "reemplazado"
  | "archivado";

export interface AcademicAssignmentRow extends BaseRow {
  title: string;
  work_type: string;
  subject_id: string | null;
  topic_id: string | null;
  competency_id: string | null;
  fundamental_question_id: string | null;
  prompt: string | null;
  rubric_version_id: string | null;
  status: AssignmentStatus;
}

export interface AssignmentSubmissionRow {
  id: string;
  assignment_id: string;
  version: number;
  content: string | null;
  file_path: string | null;
  obsidian_note_id: string | null;
  work_hash: string | null;
  submitted_at: string;
  status: "entregado" | "reemplazado";
  updated_at: string;
}

export type EvaluationVerdict = "revision_required" | "basic" | "competent" | "advanced" | "outstanding";

export interface AcademicEvaluationRow {
  id: string;
  submission_id: string;
  rubric_version_id: string;
  total_score: number;
  score_10: number;
  verdict: EvaluationVerdict;
  confidence: number | null;
  evaluator_notes: string | null;
  evaluator: "chatgpt" | "fundador" | "sodiac_heuristica";
  prompt_used: string | null;
  work_hash: string | null;
  strengths_json: string | null;
  critical_errors_json: string | null;
  required_revisions_json: string | null;
  is_calibration: number;
  calibration_of_id: string | null;
  status: "pendiente" | "aceptada" | "revision_requerida" | "rechazada" | "reemplazada";
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CriterionEvaluationRow {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  score: number;
  maximum: number;
  justification: string | null;
  evidence_json: string | null;
  weaknesses_json: string | null;
  required_improvements_json: string | null;
}

export type SubjectPlanStatus =
  | "no_iniciada"
  | "exploracion"
  | "cursando"
  | "evaluacion"
  | "revision"
  | "completada"
  | "completada_con_revision_pendiente"
  | "reabierta";

export interface SubjectAssessmentPlanRow {
  id: string;
  subject_id: string;
  minimum_final_score: number;
  minimum_mastery_level: number;
  requires_applied_evidence: number;
  requires_integrative_evaluation: number;
  requires_deferred_review: number;
  status: SubjectPlanStatus;
  created_at: string;
  updated_at: string;
}

export type AssessmentComponentCategory =
  | "notas_conceptuales"
  | "ejercicios_practicas"
  | "trabajos_aplicados"
  | "proyecto_examen_integrador"
  | "revision_diferida_defensa";

export interface AssessmentComponentRow {
  id: string;
  plan_id: string;
  category: AssessmentComponentCategory;
  weight_pct: number;
  sort_order: number;
}

export interface AcademicTranscriptEntryRow {
  id: string;
  subject_id: string | null;
  assignment_id: string | null;
  evaluation_id: string | null;
  title: string;
  work_type: string;
  score_100: number;
  score_10: number;
  verdict: string;
  status: "vigente" | "reemplazada" | "archivada";
  recorded_at: string;
  updated_at: string;
}

export type CompletionXpCategory = "finalizacion_tarea_hito" | "finalizacion_tema" | "cierre_materia";

export type XpCategory =
  | "notas_conceptuales"
  | "ejercicios_practicas"
  | "aplicaciones_casos"
  | "proyecto_examen_integrador"
  | "hitos_dominio"
  | "revision_diferida_retencion"
  | "intento"
  | CompletionXpCategory;

export interface XpEventRow {
  id: string;
  date: string;
  amount: number;
  source_type: string;
  source_id: string;
  subject_id: string | null;
  category: XpCategory;
  reason: string;
  score: number | null;
  multiplier: number | null;
  rubric_version_id: string | null;
  idempotency_key: string;
  reversal_of: string | null;
  created_at: string;
  metadata_json: string | null;
}

export interface AcademicLevelHistoryRow {
  id: string;
  level: number;
  xp_total_at: number;
  reached_at: string;
}

export interface AcademicRankRow {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  minimum_level: number;
  maximum_level: number;
  sort_order: number;
  badge: string | null;
  color_token: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProgressFormulaVersionRow {
  id: string;
  version_label: string;
  weights_json: string;
  is_current: number;
  created_at: string;
  updated_at: string;
}

export interface CareerProgressSnapshotRow {
  id: string;
  formula_version_id: string;
  ipa_total: number;
  coverage: number;
  mastery: number;
  evidence: number;
  retention: number;
  projects: number;
  computed_at: string;
}

export interface SubjectProgressSnapshotRow {
  id: string;
  subject_id: string;
  formula_version_id: string;
  ipa_total: number;
  coverage: number;
  mastery: number;
  evidence: number;
  retention: number;
  projects: number;
  computed_at: string;
}

export interface EvaluationImportRow {
  id: string;
  assignment_id: string | null;
  submission_id: string | null;
  raw_response_json: string;
  validation_status: "pendiente" | "valida" | "rechazada";
  validation_errors_json: string | null;
  resulting_evaluation_id: string | null;
  imported_at: string;
}
