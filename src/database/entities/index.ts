import { createRepository } from "../repository";
import type {
  ActivityLogRow,
  BackupRecordRow,
  BibliographicSourceRow,
  CompetencyRow,
  ContinuityPointRow,
  CurriculumDependencyRow,
  DailyPlanRow,
  DocumentVersionRow,
  FundamentalQuestionRow,
  InstitutionalDocumentRow,
  LearningEvidenceRow,
  LearningStageRow,
  MasteryAssessmentRow,
  NoteLinkRow,
  ObsidianNoteRow,
  PomodoroCycleRow,
  ProjectMilestoneRow,
  ProjectRow,
  ResourceRow,
  ReviewRow,
  StudyBlockRow,
  StudySessionRow,
  SubjectRow,
  TaskHistoryRow,
  TaskRow,
  TopicRow,
  UserSettingRow,
  WeeklyPlanRow,
} from "../types";

export const fundamentalQuestionsRepo = createRepository<FundamentalQuestionRow>("fundamental_question");
export const competenciesRepo = createRepository<CompetencyRow>("competency");
export const learningStagesRepo = createRepository<LearningStageRow>("learning_stage");
export const subjectsRepo = createRepository<SubjectRow>("subject");
export const topicsRepo = createRepository<TopicRow>("topic");
export const curriculumDependenciesRepo = createRepository<CurriculumDependencyRow>("curriculum_dependency");
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
