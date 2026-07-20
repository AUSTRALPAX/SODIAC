import { describe, expect, it, vi } from "vitest";
import type {
  CompetencyRow,
  FundamentalQuestionRow,
  ObsidianNoteRow,
  SubjectRow,
  TopicRow,
} from "@/database/types";

let mockNotes: Partial<ObsidianNoteRow>[] = [];
let mockInProgressSession: { topic_id: string | null } | null = null;

const mockXpRulesVersion = {
  id: "xp-rules-v1",
  label: "Reglas de XP fundacionales",
  career_total_xp: 100000,
  max_level: 100,
  level_curve_exponent: 1.55,
  graded_share: 0.7,
  completion_share: 0.3,
  category_weights_json: JSON.stringify({
    notas_conceptuales: 0.10,
    ejercicios_practicas: 0.20,
    aplicaciones_casos: 0.25,
    proyecto_examen_integrador: 0.30,
    hitos_dominio: 0.10,
    revision_diferida_retencion: 0.05,
    intento: 0,
  }),
  completion_category_weights_json: JSON.stringify({
    finalizacion_tarea_hito: 0.20,
    finalizacion_tema: 0.36,
    validacion_conocimiento: 0.24,
    cierre_materia: 0.20,
  }),
  frozen_at_level: null,
  frozen_at_xp: null,
  is_current: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  notes: null,
};

vi.mock("@/database/entities", () => ({
  obsidianNotesRepo: {
    list: async () => mockNotes,
  },
  xpRulesVersionsRepo: {
    list: async () => [mockXpRulesVersion],
    insert: async (row: unknown) => row,
  },
}));
vi.mock("@/services/sessions", () => ({
  getInProgressSession: async () => mockInProgressSession,
}));

const { buildMasterSchedule } = await import("@/services/masterSchedule");

function question(id: string, code: string): FundamentalQuestionRow {
  return {
    id,
    code,
    title: `Pregunta ${code}`,
    description: null,
    sort_order: 0,
    status: "activa",
    notes: null,
    tags: null,
    created_at: "",
    updated_at: "",
    archived_at: null,
  };
}

function subject(id: string, title: string, externalRef: string | null, sortOrder: number): SubjectRow {
  return {
    id,
    fundamental_question_id: "PF1",
    title,
    description: null,
    credits: 1,
    complexity: 1,
    importance: 1,
    estimated_load: 1,
    is_mandatory: 1,
    budgeted_xp: null,
    completed_at: null,
    completion_budgeted_xp: null,
    learning_stage_id: null,
    career_id: null,
    external_ref: externalRef,
    status: "activa",
    sort_order: sortOrder,
    notes: null,
    tags: null,
    created_at: "",
    updated_at: "",
    archived_at: null,
  };
}

function topic(id: string, subjectId: string, title: string, sortOrder: number, completedAt: string | null = null): TopicRow {
  return {
    id,
    subject_id: subjectId,
    competency_id: null,
    learning_stage_id: null,
    curriculum_unit_id: null,
    title,
    description: null,
    completed_at: completedAt,
    external_ref: `T-${sortOrder}`,
    status: "activa",
    sort_order: sortOrder,
    notes: null,
    tags: null,
    created_at: "",
    updated_at: "",
    archived_at: null,
  };
}

const questions: FundamentalQuestionRow[] = [question("PF1", "PF1")];
const competencies: CompetencyRow[] = [];

describe("Cronograma Maestro — orden por rutas del vault (Fase K)", () => {
  it("ordena las materias según la primera aparición en las rutas, no alfabéticamente", async () => {
    mockNotes = [
      {
        note_type: "ruta",
        title: "RUTA-00 - Calibración",
        frontmatter_json: JSON.stringify({ tipo: "ruta", id: "RUTA-00", materias: ["MAT-02"] }),
      },
      {
        note_type: "ruta",
        title: "RUTA-01 - Núcleo",
        frontmatter_json: JSON.stringify({ tipo: "ruta", id: "RUTA-01", materias: ["MAT-01"] }),
      },
    ];
    mockInProgressSession = null;

    const subjects = [subject("s-mat01", "Alfa (MAT-01)", "MAT-01", 1), subject("s-mat02", "Zeta (MAT-02)", "MAT-02", 2)];
    const topics = [topic("t1", "s-mat01", "Tema de Alfa", 1), topic("t2", "s-mat02", "Tema de Zeta", 1)];

    const schedule = await buildMasterSchedule({
      subjects,
      topics,
      questions,
      competencies,
      subjectQuestionLinks: [],
      subjectCompetencyLinks: [],
      topicQuestionLinks: [],
      topicCompetencyLinks: [],
      notes: [],
      dependencies: [],
      bibliographicSources: [],
    });

    // MAT-02 aparece en RUTA-00 (primera), MAT-01 en RUTA-01 (segunda) —
    // aunque "Alfa" < "Zeta" alfabéticamente, el orden real es Zeta primero.
    expect(schedule.steps[0]!.subject.title).toBe("Zeta (MAT-02)");
    expect(schedule.steps[1]!.subject.title).toBe("Alfa (MAT-01)");
  });

  it("las materias sin external_ref (legacy) van al final, en orden alfabético", async () => {
    mockNotes = [];
    mockInProgressSession = null;

    const subjects = [
      subject("s-legacy-b", "Legacy B", null, 0),
      subject("s-mat01", "Materia del vault", "MAT-01", 1),
      subject("s-legacy-a", "Legacy A", null, 0),
    ];
    const topics = [
      topic("t-legacy-b", "s-legacy-b", "Tema legacy B", 1),
      topic("t-vault", "s-mat01", "Tema del vault", 1),
      topic("t-legacy-a", "s-legacy-a", "Tema legacy A", 1),
    ];

    const schedule = await buildMasterSchedule({
      subjects,
      topics,
      questions,
      competencies,
      subjectQuestionLinks: [],
      subjectCompetencyLinks: [],
      topicQuestionLinks: [],
      topicCompetencyLinks: [],
      notes: [],
      dependencies: [],
      bibliographicSources: [],
    });

    expect(schedule.steps.map((s) => s.subject.title)).toEqual(["Materia del vault", "Legacy A", "Legacy B"]);
  });

  it("calcula paso actual, completados y % de recorrido correctamente", async () => {
    mockNotes = [];
    mockInProgressSession = null;

    const subjects = [subject("s1", "Materia 1", null, 0)];
    const topics = [
      topic("t1", "s1", "Tema 1", 1, "2026-01-01T00:00:00.000Z"),
      topic("t2", "s1", "Tema 2", 2, null),
      topic("t3", "s1", "Tema 3", 3, null),
    ];

    const schedule = await buildMasterSchedule({
      subjects,
      topics,
      questions,
      competencies,
      subjectQuestionLinks: [],
      subjectCompetencyLinks: [],
      topicQuestionLinks: [],
      topicCompetencyLinks: [],
      notes: [],
      dependencies: [],
      bibliographicSources: [],
    });

    expect(schedule.totalSteps).toBe(3);
    expect(schedule.completedSteps).toBe(1);
    expect(schedule.percentComplete).toBe(33);
    expect(schedule.steps[0]!.status).toBe("completado");
    expect(schedule.steps[1]!.status).toBe("proximo");
    expect(schedule.currentStepIndex).toBe(schedule.steps[1]!.globalIndex);
  });

  it("marca 'bloqueado' cuando el prerequisito real (curriculum_dependency) no está completo", async () => {
    mockNotes = [];
    mockInProgressSession = null;

    const subjects = [subject("s1", "Materia 1", null, 0)];
    const topics = [topic("t1", "s1", "Tema 1", 1, null), topic("t2", "s1", "Tema 2", 2, null)];

    const schedule = await buildMasterSchedule({
      subjects,
      topics,
      questions,
      competencies,
      subjectQuestionLinks: [],
      subjectCompetencyLinks: [],
      topicQuestionLinks: [],
      topicCompetencyLinks: [],
      notes: [],
      dependencies: [
        {
          id: "d1",
          from_topic_id: "t1",
          to_topic_id: "t2",
          dependency_type: "requires",
          status: "activo",
          notes: null,
          created_at: "",
          updated_at: "",
        },
      ],
      bibliographicSources: [],
    });

    const step2 = schedule.steps.find((s) => s.topic.id === "t2")!;
    expect(step2.status).toBe("bloqueado");
    expect(step2.prerequisiteTopics.map((t) => t.id)).toEqual(["t1"]);
  });
});
