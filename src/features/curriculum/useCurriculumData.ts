import { useEffect, useState } from "react";
import {
  competenciesRepo,
  curriculumUnitsRepo,
  fundamentalQuestionsRepo,
  learningStagesRepo,
  projectsRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  CompetencyRow,
  CurriculumUnitRow,
  FundamentalQuestionRow,
  LearningStageRow,
  ProjectRow,
  SubjectRow,
  TopicRow,
} from "@/database/types";
import { getLatestMasteryByCompetency } from "@/services/mastery";
import type { MasteryAssessmentRow } from "@/database/types";

export interface CurriculumData {
  questions: FundamentalQuestionRow[];
  competencies: CompetencyRow[];
  subjects: SubjectRow[];
  units: CurriculumUnitRow[];
  topics: TopicRow[];
  projects: ProjectRow[];
  stages: LearningStageRow[];
  masteryByCompetency: Map<string, MasteryAssessmentRow>;
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
    masteryByCompetency: new Map(),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fundamentalQuestionsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      competenciesRepo.list({ where: "archived_at IS NULL", orderBy: "code" }),
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      curriculumUnitsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      topicsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      projectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      learningStagesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      getLatestMasteryByCompetency(),
    ]).then(([questions, competencies, subjects, units, topics, projects, stages, masteryByCompetency]) => {
      setData({ questions, competencies, subjects, units, topics, projects, stages, masteryByCompetency });
      setLoading(false);
    });
  }, []);

  return { ...data, loading };
}
