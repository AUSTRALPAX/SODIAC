import { createRepository } from "../repository";
import type {
  ActivityLogRow,
  BackupRecordRow,
  CompetencyRow,
  DocumentVersionRow,
  FundamentalQuestionRow,
  InstitutionalDocumentRow,
  LearningStageRow,
  ProjectMilestoneRow,
  ProjectRow,
  SubjectRow,
  TopicRow,
  UserSettingRow,
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
