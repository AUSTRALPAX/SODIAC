import { useCallback, useEffect, useState } from "react";
import {
  competenciesRepo,
  curriculumActivitiesRepo,
  curriculumUnitsRepo,
  fundamentalQuestionsRepo,
  learningStagesRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type {
  CompetencyRow,
  CurriculumActivityRow,
  CurriculumUnitRow,
  FundamentalQuestionRow,
  LearningStageRow,
  SubjectRow,
  TopicRow,
} from "@/database/types";

export interface CareerData {
  questions: FundamentalQuestionRow[];
  competencies: CompetencyRow[];
  stages: LearningStageRow[];
  subjects: SubjectRow[];
  units: CurriculumUnitRow[];
  topics: TopicRow[];
  activities: CurriculumActivityRow[];
  loading: boolean;
  /** Vuelve a leer todo desde la base — llamar después de marcar algo como completado. */
  reload: () => void;
}

/**
 * Agrega los datos de Carrera desde las mismas tablas que ya usan Mapa
 * (`useCurriculumData`), Trayectoria y Biblioteca — no hay una copia
 * separada del currículo, solo una lectura distinta de los mismos repos.
 */
export function useCareerData(): CareerData {
  const [data, setData] = useState<Omit<CareerData, "loading" | "reload">>({
    questions: [],
    competencies: [],
    stages: [],
    subjects: [],
    units: [],
    topics: [],
    activities: [],
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      fundamentalQuestionsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      competenciesRepo.list({ where: "archived_at IS NULL", orderBy: "code" }),
      learningStagesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      curriculumUnitsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      topicsRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" }),
      curriculumActivitiesRepo.list({ where: "archived_at IS NULL", orderBy: "scheduled_date" }),
    ]).then(([questions, competencies, stages, subjects, units, topics, activities]) => {
      setData({ questions, competencies, stages, subjects, units, topics, activities });
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, reload: load };
}
