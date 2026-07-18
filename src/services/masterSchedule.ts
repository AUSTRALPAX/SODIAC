/**
 * Cronograma Maestro (Fase K): el recorrido completo y recomendado de toda
 * la carrera, de principio a fin, sin fechas obligatorias. El orden es
 * curricular (`sequenceOrder`), no temporal.
 *
 * El criterio de orden (sección 4/6 del pedido): las 30 materias reales
 * siguen el orden de las 7 rutas de aprendizaje ya autoradas en el vault
 * (RUTA-00..06 → primera aparición de cada MAT-XX), que es la única
 * secuencia pedagógica explícita que existe hoy — no se inventa un orden.
 * Las 9 materias legacy (sin `external_ref`, ver docs/MASTER_SCHEDULE_MAP_AUDIT.md)
 * van al final, en orden alfabético, porque ninguna ruta las menciona y no
 * hay forma honesta de intercalarlas sin adivinar.
 *
 * No se persiste ningún "sequenceOrder" nuevo: se recalcula en memoria cada
 * vez a partir de subject.sort_order/topic.sort_order (ya poblados por la
 * reconciliación) y de las notas "ruta" ya indexadas — así que reindexar el
 * vault (por ejemplo si se agrega una ruta nueva) lo actualiza solo.
 */
import { obsidianNotesRepo } from "@/database/entities";
import { getInProgressSession } from "@/services/sessions";
import { computeSubjectBudgetShare, COMPLETION_CATEGORY_WEIGHTS } from "@/services/xp";
import type {
  BibliographicSourceRow,
  CompetencyRow,
  CurriculumDependencyRow,
  FundamentalQuestionRow,
  ObsidianNoteRow,
  SubjectCompetencyRow,
  SubjectFundamentalQuestionRow,
  SubjectRow,
  TopicCompetencyRow,
  TopicFundamentalQuestionRow,
  TopicRow,
} from "@/database/types";

export type ScheduleStepStatus =
  | "completado"
  | "activo"
  | "proximo"
  | "disponible"
  | "pendiente"
  | "bloqueado";

export interface ScheduleStep {
  topic: TopicRow;
  subject: SubjectRow;
  globalIndex: number; // 1-based, posición dentro de TODA la carrera
  indexInSubject: number; // 1-based, posición dentro de la materia
  etapa: string; // nombre de la ruta de aprendizaje, o "Sin ruta asignada"
  primaryQuestion: FundamentalQuestionRow | null;
  primaryCompetency: CompetencyRow | null;
  secondaryQuestions: FundamentalQuestionRow[];
  secondaryCompetencies: CompetencyRow[];
  status: ScheduleStepStatus;
  xpAvailable: number;
  relatedNoteCount: number;
  relatedResourceCount: number;
  /** Prerequisitos reales (curriculum_dependency), no solo el orden implícito. */
  prerequisiteTopics: TopicRow[];
}

export interface MasterSchedule {
  steps: ScheduleStep[];
  totalSteps: number;
  completedSteps: number;
  currentStepIndex: number | null; // globalIndex del paso "próximo"/"activo", o null si todo está completo
  percentComplete: number;
  xpEarnedEstimate: number;
  xpRemainingEstimate: number;
  activeSubjectTitle: string | null;
  activeEtapa: string | null;
}

interface RutaFrontmatter {
  tipo?: string;
  id?: string;
  materias?: string[];
}

async function loadRutaOrder(): Promise<{ order: Map<string, string>; etapaLabel: Map<string, string> }> {
  const notes = await obsidianNotesRepo.list({ where: "note_type = 'ruta'" });
  const rutaNotes = notes
    .map((n) => {
      try {
        const fm = JSON.parse(n.frontmatter_json ?? "null") as RutaFrontmatter | null;
        return fm?.id ? { fm, title: n.title } : null;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { fm: RutaFrontmatter; title: string | null } => !!entry)
    .sort((a, b) => a.fm.id!.localeCompare(b.fm.id!));

  const materiaToRuta = new Map<string, string>(); // MAT-XX -> RUTA-XX (primera aparición)
  const etapaLabel = new Map<string, string>();
  for (const { fm: ruta, title } of rutaNotes) {
    // "RUTA-00 - Calibración y puesta en marcha" -> "Calibración y puesta en marcha".
    const prefix = `${ruta.id} - `;
    const label = title?.startsWith(prefix) ? title.slice(prefix.length) : (title ?? ruta.id!);
    etapaLabel.set(ruta.id!, label);
    for (const mat of ruta.materias ?? []) {
      if (!materiaToRuta.has(mat)) materiaToRuta.set(mat, ruta.id!);
    }
  }
  return { order: materiaToRuta, etapaLabel };
}

/**
 * Orden global de materias: primero las cubiertas por alguna ruta (por
 * primera aparición), luego las del vault que por alguna razón ninguna
 * ruta menciona (alfabético — no debería pasar hoy, las 30 están cubiertas,
 * pero si se agrega una materia nueva sin ruta todavía no debe mezclarse
 * con las legacy), y al final las 9 legacy sin `external_ref`.
 */
function sortSubjects(subjects: SubjectRow[], materiaToRuta: Map<string, string>): SubjectRow[] {
  const rutaOrder = [...new Set(materiaToRuta.values())].sort();
  const rutaIndex = new Map(rutaOrder.map((r, i) => [r, i]));

  return [...subjects].sort((a, b) => {
    const rutaA = a.external_ref ? materiaToRuta.get(a.external_ref) : undefined;
    const rutaB = b.external_ref ? materiaToRuta.get(b.external_ref) : undefined;
    const groupA = rutaA ? (rutaIndex.get(rutaA) ?? 999) : a.external_ref ? 999 : 1000;
    const groupB = rutaB ? (rutaIndex.get(rutaB) ?? 999) : b.external_ref ? 999 : 1000;
    if (groupA !== groupB) return groupA - groupB;
    if (rutaA && rutaB) {
      // Dentro de la misma ruta, respetar el orden declarado en la nota ruta
      // (ya capturado en sort_order al importar: sufijo numérico de MAT-XX).
      return a.sort_order - b.sort_order;
    }
    return a.title.localeCompare(b.title);
  });
}

export interface BuildMasterScheduleInput {
  subjects: SubjectRow[];
  topics: TopicRow[];
  questions: FundamentalQuestionRow[];
  competencies: CompetencyRow[];
  subjectQuestionLinks: SubjectFundamentalQuestionRow[];
  subjectCompetencyLinks: SubjectCompetencyRow[];
  topicQuestionLinks: TopicFundamentalQuestionRow[];
  topicCompetencyLinks: TopicCompetencyRow[];
  notes: ObsidianNoteRow[]; // solo las que tienen sodiac_id
  dependencies: CurriculumDependencyRow[];
  bibliographicSources: BibliographicSourceRow[];
}

export async function buildMasterSchedule(input: BuildMasterScheduleInput): Promise<MasterSchedule> {
  const { order: materiaToRuta, etapaLabel } = await loadRutaOrder();
  const inProgressSession = await getInProgressSession();

  const questionById = new Map(input.questions.map((q) => [q.id, q]));
  const competencyById = new Map(input.competencies.map((c) => [c.id, c]));
  const noteCountByEntityId = new Map<string, number>();
  for (const note of input.notes) {
    if (!note.sodiac_id) continue;
    noteCountByEntityId.set(note.sodiac_id, (noteCountByEntityId.get(note.sodiac_id) ?? 0) + 1);
  }
  const resourceCountByTopicId = new Map<string, number>();
  for (const link of input.bibliographicSources) {
    if (!link.topic_id) continue;
    resourceCountByTopicId.set(link.topic_id, (resourceCountByTopicId.get(link.topic_id) ?? 0) + 1);
  }

  const secondaryQuestionsBySubject = new Map<string, string[]>();
  for (const link of input.subjectQuestionLinks) {
    const list = secondaryQuestionsBySubject.get(link.subject_id) ?? [];
    list.push(link.fundamental_question_id);
    secondaryQuestionsBySubject.set(link.subject_id, list);
  }
  const secondaryCompetenciesBySubject = new Map<string, string[]>();
  for (const link of input.subjectCompetencyLinks) {
    const list = secondaryCompetenciesBySubject.get(link.subject_id) ?? [];
    list.push(link.competency_id);
    secondaryCompetenciesBySubject.set(link.subject_id, list);
  }
  const secondaryQuestionsByTopic = new Map<string, string[]>();
  for (const link of input.topicQuestionLinks) {
    const list = secondaryQuestionsByTopic.get(link.topic_id) ?? [];
    list.push(link.fundamental_question_id);
    secondaryQuestionsByTopic.set(link.topic_id, list);
  }
  const secondaryCompetenciesByTopic = new Map<string, string[]>();
  for (const link of input.topicCompetencyLinks) {
    const list = secondaryCompetenciesByTopic.get(link.topic_id) ?? [];
    list.push(link.competency_id);
    secondaryCompetenciesByTopic.set(link.topic_id, list);
  }

  const topicById = new Map(input.topics.map((t) => [t.id, t]));
  const prerequisitesByTopic = new Map<string, TopicRow[]>();
  for (const dep of input.dependencies) {
    if (dep.dependency_type !== "requires") continue;
    const prereq = topicById.get(dep.from_topic_id);
    if (!prereq) continue;
    const list = prerequisitesByTopic.get(dep.to_topic_id) ?? [];
    list.push(prereq);
    prerequisitesByTopic.set(dep.to_topic_id, list);
  }

  const activeSubjects = input.subjects; // ya vienen filtradas por archived_at IS NULL
  const sortedSubjects = sortSubjects(activeSubjects, materiaToRuta);

  const topicsBySubject = new Map<string, TopicRow[]>();
  for (const t of input.topics) {
    const list = topicsBySubject.get(t.subject_id) ?? [];
    list.push(t);
    topicsBySubject.set(t.subject_id, list);
  }
  for (const list of topicsBySubject.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
  }

  const steps: ScheduleStep[] = [];
  let globalIndex = 0;
  let firstIncompleteAssigned = false;

  for (const subject of sortedSubjects) {
    const topics = topicsBySubject.get(subject.id) ?? [];
    if (topics.length === 0) continue;

    const { completion } = computeSubjectBudgetShare(subject, activeSubjects);
    // XP total potencial del tema — se obtiene completándolo (finalizacion_tema) más
    // validando el conocimiento (validacion_conocimiento); juntos suman lo mismo que
    // antes de dividir la categoría en dos.
    const topicShare = COMPLETION_CATEGORY_WEIGHTS.finalizacion_tema + COMPLETION_CATEGORY_WEIGHTS.validacion_conocimiento;
    const xpPerTopic = (completion * topicShare) / topics.length;

    const etapa = subject.external_ref
      ? (etapaLabel.get(materiaToRuta.get(subject.external_ref) ?? "") ?? "Sin ruta asignada")
      : "Materias sin ruta asignada (fuera del vault)";

    const subjectSecondaryQuestions = (secondaryQuestionsBySubject.get(subject.id) ?? [])
      .map((id) => questionById.get(id))
      .filter((q): q is FundamentalQuestionRow => !!q);
    const subjectSecondaryCompetencies = (secondaryCompetenciesBySubject.get(subject.id) ?? [])
      .map((id) => competencyById.get(id))
      .filter((c): c is CompetencyRow => !!c);

    for (const topic of topics) {
      globalIndex++;
      const isCompleted = !!topic.completed_at;
      const isActive = inProgressSession?.topic_id === topic.id;
      const prerequisiteTopics = prerequisitesByTopic.get(topic.id) ?? [];
      const hasUnmetPrerequisite = prerequisiteTopics.some((p) => !p.completed_at);

      let status: ScheduleStepStatus;
      if (isCompleted) status = "completado";
      else if (isActive) status = "activo";
      else if (hasUnmetPrerequisite) status = "bloqueado";
      else if (!firstIncompleteAssigned) {
        status = "proximo";
        firstIncompleteAssigned = true;
      } else status = "disponible";

      const topicQuestions = secondaryQuestionsByTopic.get(topic.id) ?? [];
      const topicCompetencies = secondaryCompetenciesByTopic.get(topic.id) ?? [];
      const primaryQuestion = topicQuestions[0] ? (questionById.get(topicQuestions[0]) ?? null) : null;

      steps.push({
        topic,
        subject,
        globalIndex,
        indexInSubject: topics.indexOf(topic) + 1,
        etapa,
        primaryQuestion,
        primaryCompetency: topic.competency_id ? (competencyById.get(topic.competency_id) ?? null) : null,
        secondaryQuestions: [...subjectSecondaryQuestions, ...topicQuestions.slice(1).map((id) => questionById.get(id))].filter(
          (q): q is FundamentalQuestionRow => !!q,
        ),
        secondaryCompetencies: [
          ...subjectSecondaryCompetencies,
          ...topicCompetencies.slice(1).map((id) => competencyById.get(id)),
        ].filter((c): c is CompetencyRow => !!c),
        status,
        xpAvailable: Math.round(xpPerTopic),
        relatedNoteCount: noteCountByEntityId.get(topic.id) ?? 0,
        relatedResourceCount: resourceCountByTopicId.get(topic.id) ?? 0,
        prerequisiteTopics,
      });
    }
  }

  const completedSteps = steps.filter((s) => s.status === "completado").length;
  const current = steps.find((s) => s.status === "activo") ?? steps.find((s) => s.status === "proximo") ?? null;
  const xpEarnedEstimate = steps.filter((s) => s.status === "completado").reduce((sum, s) => sum + s.xpAvailable, 0);
  const xpRemainingEstimate = steps.filter((s) => s.status !== "completado").reduce((sum, s) => sum + s.xpAvailable, 0);

  return {
    steps,
    totalSteps: steps.length,
    completedSteps,
    currentStepIndex: current?.globalIndex ?? null,
    percentComplete: steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0,
    xpEarnedEstimate: Math.round(xpEarnedEstimate),
    xpRemainingEstimate: Math.round(xpRemainingEstimate),
    activeSubjectTitle: current?.subject.title ?? null,
    activeEtapa: current?.etapa ?? null,
  };
}
