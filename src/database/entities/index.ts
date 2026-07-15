import { createRepository } from "../repository";
import type {
  ActivityLogRow,
  BackupRecordRow,
  CompetencyRow,
  ContinuityPointRow,
  DailyPlanRow,
  DocumentVersionRow,
  FundamentalQuestionRow,
  InstitutionalDocumentRow,
  LearningStageRow,
  ProjectMilestoneRow,
  ProjectRow,
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
