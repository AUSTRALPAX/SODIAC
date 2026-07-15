import { useEffect, useState } from "react";
import {
  competenciesRepo,
  fundamentalQuestionsRepo,
  learningStagesRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  CompetencyRow,
  FundamentalQuestionRow,
  LearningStageRow,
  SubjectRow,
  TopicRow,
} from "@/database/types";
import { getLatestMasteryByCompetency } from "@/services/mastery";
import type { MasteryAssessmentRow } from "@/database/types";

export interface CurriculumData {
  questions: FundamentalQuestionRow[];
  competencies: CompetencyRow[];
  subjects: SubjectRow[];
  topics: TopicRow[];
  stages: LearningStageRow[];
  masteryByCompetency: Map<string, MasteryAssessmentRow>;
  loading: boolean;
}

export function useCurriculumData(): CurriculumData {
  const [data, setData] = useState<Omit<CurriculumData, "loading">>({
    questions: [],
    competencies: [],
    subjects: [],
    topics: [],
    stages: [],
    masteryByCompetency: new Map(),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fundamentalQuestionsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      competenciesRepo.list({ where: "archived_at IS NULL", orderBy: "code" }),
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      topicsRepo.list({ where: "archived_at IS NULL", orderBy: "title" }),
      learningStagesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      getLatestMasteryByCompetency(),
    ]).then(([questions, competencies, subjects, topics, stages, masteryByCompetency]) => {
      setData({ questions, competencies, subjects, topics, stages, masteryByCompetency });
      setLoading(false);
    });
  }, []);

  return { ...data, loading };
}
