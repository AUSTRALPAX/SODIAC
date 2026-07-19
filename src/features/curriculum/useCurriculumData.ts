import { useEffect, useState } from "react";
import {
  competenciesRepo,
  curriculumUnitsRepo,
  fundamentalQuestionsRepo,
  learningStagesRepo,
  obsidianNotesRepo,
  projectsRepo,
  subjectCompetenciesRepo,
  subjectFundamentalQuestionsRepo,
  subjectsRepo,
  topicCompetenciesRepo,
  topicFundamentalQuestionsRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  CompetencyRow,
  CurriculumUnitRow,
  FundamentalQuestionRow,
  LearningStageRow,
  ObsidianNoteRow,
  ProjectRow,
  SubjectCompetencyRow,
  SubjectFundamentalQuestionRow,
  SubjectRow,
  TopicCompetencyRow,
  TopicFundamentalQuestionRow,
  TopicRow,
} from "@/database/types";
import { getLatestMasteryByCompetency } from "@/services/mastery";
import type { MasteryAssessmentRow } from "@/database/types";
import { loadTopicLearningSignals, type TopicLearningSignals } from "@/services/learningState";

export interface CurriculumData {
  questions: FundamentalQuestionRow[];
  competencies: CompetencyRow[];
  subjects: SubjectRow[];
  units: CurriculumUnitRow[];
  topics: TopicRow[];
  projects: ProjectRow[];
  stages: LearningStageRow[];
  notes: ObsidianNoteRow[]; // solo las que tienen sodiac_id (vinculadas a una entidad)
  subjectQuestionLinks: SubjectFundamentalQuestionRow[];
  subjectCompetencyLinks: SubjectCompetencyRow[];
  topicQuestionLinks: TopicFundamentalQuestionRow[];
  topicCompetencyLinks: TopicCompetencyRow[];
  masteryByCompetency: Map<string, MasteryAssessmentRow>;
  /** Señales reales de aprendizaje por tema (sesiones, notas, validación, repaso) — ver learningState.ts. */
  learningSignals: Map<string, TopicLearningSignals>;
  loading: boolean;
}

export function useCurriculumData(): CurriculumData {
  const [data, setData] = useState<Omit<CurriculumData, "loading">>({
    questions: [],
    competencies: [],
    subjects: [],
    units: [],
    topics: [],
    projects: [],
    stages: [],
    notes: [],
    subjectQuestionLinks: [],
    subjectCompetencyLinks: [],
    topicQuestionLinks: [],
    topicCompetencyLinks: [],
    masteryByCompetency: new Map(),
    learningSignals: new Map(),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fundamentalQuestionsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      competenciesRepo.list({ where: "archived_at IS NULL AND origin = 'curriculum'", orderBy: "code" }),
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      curriculumUnitsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      topicsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      projectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      learningStagesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      obsidianNotesRepo.list({ where: "sodiac_id IS NOT NULL" }),
      subjectFundamentalQuestionsRepo.list(),
      subjectCompetenciesRepo.list(),
      topicFundamentalQuestionsRepo.list(),
      topicCompetenciesRepo.list(),
      getLatestMasteryByCompetency(),
      loadTopicLearningSignals(),
    ]).then(
      ([
        questions,
        competencies,
        subjects,
        units,
        topics,
        projects,
        stages,
        notes,
        subjectQuestionLinks,
        subjectCompetencyLinks,
        topicQuestionLinks,
        topicCompetencyLinks,
        masteryByCompetency,
        learningSignals,
      ]) => {
        setData({
          questions,
          competencies,
          subjects,
          units,
          topics,
          projects,
          stages,
          notes,
          subjectQuestionLinks,
          subjectCompetencyLinks,
          topicQuestionLinks,
          topicCompetencyLinks,
          masteryByCompetency,
          learningSignals,
        });
        setLoading(false);
      },
    );
  }, []);

  return { ...data, loading };
}
