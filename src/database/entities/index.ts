import { createRepository } from "../repository";
import type {
  AcademicAssignmentRow,
  AcademicEvaluationRow,
  AcademicLevelHistoryRow,
  AcademicRankRow,
  AcademicTranscriptEntryRow,
  ActivityLogRow,
  AssessmentComponentRow,
  AssignmentSubmissionRow,
  BackupRecordRow,
  BibliographicSourceRow,
  CareerProgressSnapshotRow,
  CareerRow,
  CompetencyRow,
  ContinuityPointRow,
  CriterionEvaluationRow,
  CurriculumActivityRow,
  CurriculumDependencyRow,
  CurriculumUnitRow,
  DailyPlanRow,
  DocumentVersionRow,
  EvaluationImportRow,
  FundamentalQuestionRow,
  GradingRubricRow,
  GradingRubricVersionRow,
  InstitutionalDocumentRow,
  LearningEvidenceRow,
  LearningStageRow,
  MasteryAssessmentRow,
  NoteLinkRow,
  ObsidianNoteRow,
  PomodoroCycleRow,
  ProgressFormulaVersionRow,
  ProjectMilestoneRow,
  ProjectRow,
  ResourceRow,
  ReviewRow,
  RubricCriterionRow,
  StudyBlockRow,
  StudySessionRow,
  SubjectAssessmentPlanRow,
  SubjectProgressSnapshotRow,
  SubjectRow,
  TaskHistoryRow,
  TaskRow,
  TopicRow,
  UserSettingRow,
  WeeklyPlanRow,
  XpEventRow,
} from "../types";

export const fundamentalQuestionsRepo = createRepository<FundamentalQuestionRow>("fundamental_question");
export const competenciesRepo = createRepository<CompetencyRow>("competency");
export const learningStagesRepo = createRepository<LearningStageRow>("learning_stage");
export const subjectsRepo = createRepository<SubjectRow>("subject");
export const topicsRepo = createRepository<TopicRow>("topic");
export const curriculumDependenciesRepo = createRepository<CurriculumDependencyRow>("curriculum_dependency");
export const careersRepo = createRepository<CareerRow>("career");
export const curriculumUnitsRepo = createRepository<CurriculumUnitRow>("curriculum_unit");
export const curriculumActivitiesRepo = createRepository<CurriculumActivityRow>("curriculum_activity");
export const projectsRepo = createRepository<ProjectRow>("project");
export const projectMilestonesRepo = createRepository<ProjectMilestoneRow>("project_milestone");
export const institutionalDocumentsRepo = createRepository<InstitutionalDocumentRow>("institutional_document");
export const documentVersionsRepo = createRepository<DocumentVersionRow>("document_version");
export const activityLogRepo = createRepository<ActivityLogRow>("activity_log");
export const userSettingsRepo = createRepository<UserSettingRow>("user_setting");
export const backupRecordsRepo = createRepository<BackupRecordRow>("backup_record");
export const tasksRepo = createRepository<TaskRow>("task");
export const taskHistoryRepo = createRepository<TaskHistoryRow>("task_history");
export const dailyPlansRepo = createRepository<DailyPlanRow>("daily_plan");
export const weeklyPlansRepo = createRepository<WeeklyPlanRow>("weekly_plan");
export const continuityPointsRepo = createRepository<ContinuityPointRow>("continuity_point");
export const studySessionsRepo = createRepository<StudySessionRow>("study_session");
export const studyBlocksRepo = createRepository<StudyBlockRow>("study_block");
export const pomodoroCyclesRepo = createRepository<PomodoroCycleRow>("pomodoro_cycle");
export const learningEvidenceRepo = createRepository<LearningEvidenceRow>("learning_evidence");
export const masteryAssessmentsRepo = createRepository<MasteryAssessmentRow>("mastery_assessment");
export const reviewsRepo = createRepository<ReviewRow>("review");
export const obsidianNotesRepo = createRepository<ObsidianNoteRow>("obsidian_note");
export const noteLinksRepo = createRepository<NoteLinkRow>("note_link");
export const resourcesRepo = createRepository<ResourceRow>("resource");
export const bibliographicSourcesRepo = createRepository<BibliographicSourceRow>("bibliographic_source");

// --- Sistema académico de calificaciones, XP, niveles y rangos --------------------------
export const gradingRubricsRepo = createRepository<GradingRubricRow>("grading_rubric");
export const gradingRubricVersionsRepo = createRepository<GradingRubricVersionRow>("grading_rubric_version");
export const rubricCriteriaRepo = createRepository<RubricCriterionRow>("rubric_criterion");
export const academicAssignmentsRepo = createRepository<AcademicAssignmentRow>("academic_assignment");
export const assignmentSubmissionsRepo = createRepository<AssignmentSubmissionRow>("assignment_submission");
export const academicEvaluationsRepo = createRepository<AcademicEvaluationRow>("academic_evaluation");
export const criterionEvaluationsRepo = createRepository<CriterionEvaluationRow>("criterion_evaluation");
export const subjectAssessmentPlansRepo = createRepository<SubjectAssessmentPlanRow>("subject_assessment_plan");
export const assessmentComponentsRepo = createRepository<AssessmentComponentRow>("assessment_component");
export const academicTranscriptEntriesRepo = createRepository<AcademicTranscriptEntryRow>("academic_transcript_entry");
export const xpEventsRepo = createRepository<XpEventRow>("xp_event");
export const academicLevelHistoryRepo = createRepository<AcademicLevelHistoryRow>("academic_level_history");
export const academicRanksRepo = createRepository<AcademicRankRow>("academic_rank");
export const progressFormulaVersionsRepo = createRepository<ProgressFormulaVersionRow>("progress_formula_version");
export const careerProgressSnapshotsRepo = createRepository<CareerProgressSnapshotRow>("career_progress_snapshot");
export const subjectProgressSnapshotsRepo = createRepository<SubjectProgressSnapshotRow>("subject_progress_snapshot");
export const evaluationImportsRepo = createRepository<EvaluationImportRow>("evaluation_import");
