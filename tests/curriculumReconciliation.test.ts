import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CompetencyRow,
  FundamentalQuestionRow,
  ObsidianNoteRow,
  SubjectCompetencyRow,
  SubjectFundamentalQuestionRow,
  SubjectRow,
  TopicCompetencyRow,
  TopicFundamentalQuestionRow,
  TopicRow,
} from "@/database/types";
import type { CurriculumDependencyRow } from "@/database/types";

/** Repo en memoria mínimo — list/insert/update, suficiente para estos tests. */
function makeMemoryRepo<T extends { id: string }>(seed: T[] = []) {
  const rows = [...seed];
  return {
    rows,
    async list() {
      return [...rows];
    },
    async insert(row: T) {
      rows.push(row);
      return row;
    },
    async update(id: string, patch: Partial<T>) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
    async getById(id: string) {
      return rows.find((r) => r.id === id) ?? null;
    },
  };
}

let fundamentalQuestions: ReturnType<typeof makeMemoryRepo<FundamentalQuestionRow>>;
let competencies: ReturnType<typeof makeMemoryRepo<CompetencyRow>>;
let subjects: ReturnType<typeof makeMemoryRepo<SubjectRow>>;
let topics: ReturnType<typeof makeMemoryRepo<TopicRow>>;
let obsidianNotes: ReturnType<typeof makeMemoryRepo<ObsidianNoteRow>>;
let subjectFundamentalQuestions: ReturnType<typeof makeMemoryRepo<SubjectFundamentalQuestionRow>>;
let subjectCompetencies: ReturnType<typeof makeMemoryRepo<SubjectCompetencyRow>>;
let topicFundamentalQuestions: ReturnType<typeof makeMemoryRepo<TopicFundamentalQuestionRow>>;
let topicCompetencies: ReturnType<typeof makeMemoryRepo<TopicCompetencyRow>>;
let curriculumDependencies: ReturnType<typeof makeMemoryRepo<CurriculumDependencyRow>>;

vi.mock("@/database/entities", () => ({
  get fundamentalQuestionsRepo() {
    return fundamentalQuestions;
  },
  get competenciesRepo() {
    return competencies;
  },
  get subjectsRepo() {
    return subjects;
  },
  get topicsRepo() {
    return topics;
  },
  get obsidianNotesRepo() {
    return obsidianNotes;
  },
  get subjectFundamentalQuestionsRepo() {
    return subjectFundamentalQuestions;
  },
  get subjectCompetenciesRepo() {
    return subjectCompetencies;
  },
  get topicFundamentalQuestionsRepo() {
    return topicFundamentalQuestions;
  },
  get topicCompetenciesRepo() {
    return topicCompetencies;
  },
  get curriculumDependenciesRepo() {
    return curriculumDependencies;
  },
}));

const {
  importCareerFromObsidian,
  generateSequentialDependencies,
  computeAcademicIntegrityAudit,
  listReconciliationCandidates,
  clearBrokenTopicCompetencyRefs,
} = await import("@/services/curriculumReconciliation");

function baseRow() {
  return {
    status: "activa",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: "",
    updated_at: "",
    archived_at: null,
  };
}

function noteRow(overrides: Partial<ObsidianNoteRow> & { id: string }): ObsidianNoteRow {
  return {
    vault_relative_path: `${overrides.id}.md`,
    title: null,
    frontmatter_json: null,
    indexed_at: "",
    checksum: null,
    sodiac_id: null,
    note_type: null,
    status: null,
    mastery_level: null,
    last_review_at: null,
    next_review_at: null,
    created_at: "",
    updated_at: "",
    sync_state: "sincronizada",
    last_synced_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  fundamentalQuestions = makeMemoryRepo<FundamentalQuestionRow>([
    { id: "q1", code: "PF1", title: "Pregunta 1", description: null, external_ref: null, ...baseRow() },
  ]);
  competencies = makeMemoryRepo<CompetencyRow>([]);
  subjects = makeMemoryRepo<SubjectRow>([]);
  topics = makeMemoryRepo<TopicRow>([]);
  obsidianNotes = makeMemoryRepo<ObsidianNoteRow>([]);
  subjectFundamentalQuestions = makeMemoryRepo<SubjectFundamentalQuestionRow>([]);
  subjectCompetencies = makeMemoryRepo<SubjectCompetencyRow>([]);
  topicFundamentalQuestions = makeMemoryRepo<TopicFundamentalQuestionRow>([]);
  topicCompetencies = makeMemoryRepo<TopicCompetencyRow>([]);
  curriculumDependencies = makeMemoryRepo<CurriculumDependencyRow>([]);
});

describe("importCareerFromObsidian (Fase J) — reconciliación con datos sintéticos", () => {
  function seedVaultNotes() {
    obsidianNotes.rows.push(
      noteRow({
        id: "note-comp1",
        note_type: "competencia",
        title: "COMP-01 - Pensamiento crítico",
        frontmatter_json: JSON.stringify({ tipo: "competencia", id: "COMP-01" }),
      }),
      noteRow({
        id: "note-mat1",
        note_type: "materia",
        title: "MAT-01 - Lógica",
        frontmatter_json: JSON.stringify({
          tipo: "materia",
          id: "MAT-01",
          preguntas: ["PF-01"],
          competencias: ["COMP-01"],
        }),
      }),
      noteRow({
        id: "note-t1",
        note_type: "tema",
        title: "T-01.01 - Argumentos",
        frontmatter_json: JSON.stringify({
          tipo: "tema",
          id: "T-01.01",
          materia: "MAT-01",
          preguntas: ["PF-01"],
          competencias: ["COMP-01"],
        }),
      }),
    );
  }

  it("crea competencia, materia y tema nuevos, y vincula las notas por sodiac_id", async () => {
    seedVaultNotes();
    const summary = await importCareerFromObsidian();

    expect(summary.competenciesCreated).toBe(1);
    expect(summary.subjectsCreated).toBe(1);
    expect(summary.topicsCreated).toBe(1);
    expect(summary.questionsLinked).toBe(1);
    expect(summary.notesLinked).toBe(3);
    // El fixture solo sembró PF1 — PF2..PF6 quedan sin resolver, correctamente.
    expect(summary.unresolved).toHaveLength(5);
    expect(summary.unresolved.every((u) => u.includes("Pregunta fundamental sin fila en SQLite"))).toBe(true);

    expect(fundamentalQuestions.rows[0]!.external_ref).toBe("PF-01");
    expect(competencies.rows[0]!.origin).toBe("curriculum");
    expect(subjects.rows[0]!.external_ref).toBe("MAT-01");
    expect(topics.rows[0]!.external_ref).toBe("T-01.01");
    expect(topics.rows[0]!.competency_id).toBe(competencies.rows[0]!.id);
    expect(subjectFundamentalQuestions.rows).toHaveLength(1);
    expect(subjectCompetencies.rows).toHaveLength(1);
    expect(topicFundamentalQuestions.rows).toHaveLength(1);
    expect(topicCompetencies.rows).toHaveLength(1);

    for (const note of obsidianNotes.rows) {
      expect(note.sodiac_id).not.toBeNull();
    }
  });

  it("es idempotente: correrlo dos veces no duplica nada", async () => {
    seedVaultNotes();
    await importCareerFromObsidian();
    const second = await importCareerFromObsidian();

    expect(second.competenciesCreated).toBe(0);
    expect(second.subjectsCreated).toBe(0);
    expect(second.topicsCreated).toBe(0);
    expect(second.competenciesSkipped).toBe(1);
    expect(second.subjectsSkipped).toBe(1);
    expect(second.topicsSkipped).toBe(1);
    expect(competencies.rows).toHaveLength(1);
    expect(subjects.rows).toHaveLength(1);
    expect(topics.rows).toHaveLength(1);
  });

  it("no inventa un vínculo: omite la materia si no puede resolver una pregunta fundamental primaria", async () => {
    obsidianNotes.rows.push(
      noteRow({
        id: "note-mat-huerfana",
        note_type: "materia",
        title: "MAT-99 - Sin pregunta",
        frontmatter_json: JSON.stringify({ tipo: "materia", id: "MAT-99", preguntas: ["PF-99-inexistente"] }),
      }),
    );
    const summary = await importCareerFromObsidian();

    expect(summary.subjectsCreated).toBe(0);
    expect(summary.unresolved.some((u) => u.includes("MAT-99"))).toBe(true);
    expect(subjects.rows).toHaveLength(0);
  });
});

describe("generateSequentialDependencies (Fase M) — prerequisitos reales", () => {
  it("crea N-1 dependencias por materia y es idempotente", async () => {
    subjects.rows.push({ id: "s1", fundamental_question_id: "q1", title: "Materia", description: null, ...baseRow(), credits: 1, complexity: 1, importance: 1, estimated_load: 1, is_mandatory: 1, budgeted_xp: null, completed_at: null, completion_budgeted_xp: null, learning_stage_id: null, career_id: null, external_ref: null });
    topics.rows.push(
      { id: "t1", subject_id: "s1", competency_id: null, learning_stage_id: null, curriculum_unit_id: null, title: "Tema 1", description: null, completed_at: null, external_ref: null, ...baseRow(), sort_order: 1 },
      { id: "t2", subject_id: "s1", competency_id: null, learning_stage_id: null, curriculum_unit_id: null, title: "Tema 2", description: null, completed_at: null, external_ref: null, ...baseRow(), sort_order: 2 },
      { id: "t3", subject_id: "s1", competency_id: null, learning_stage_id: null, curriculum_unit_id: null, title: "Tema 3", description: null, completed_at: null, external_ref: null, ...baseRow(), sort_order: 3 },
    );

    const first = await generateSequentialDependencies();
    expect(first.created).toBe(2);
    expect(curriculumDependencies.rows).toHaveLength(2);
    expect(curriculumDependencies.rows.map((d) => `${d.from_topic_id}->${d.to_topic_id}`)).toEqual(["t1->t2", "t2->t3"]);

    const second = await generateSequentialDependencies();
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
    expect(curriculumDependencies.rows).toHaveLength(2);
  });
});

describe("computeAcademicIntegrityAudit (sección 12) — solo lectura", () => {
  it("detecta materias sin nota, IDs duplicados y referencias rotas", async () => {
    subjects.rows.push(
      { id: "s1", fundamental_question_id: "q1", title: "Con nota", description: null, ...baseRow(), credits: 1, complexity: 1, importance: 1, estimated_load: 1, is_mandatory: 1, budgeted_xp: null, completed_at: null, completion_budgeted_xp: null, learning_stage_id: null, career_id: null, external_ref: "MAT-01" },
      { id: "s2", fundamental_question_id: "q-inexistente", title: "Sin nota y con FK rota", description: null, ...baseRow(), credits: 1, complexity: 1, importance: 1, estimated_load: 1, is_mandatory: 1, budgeted_xp: null, completed_at: null, completion_budgeted_xp: null, learning_stage_id: null, career_id: null, external_ref: "MAT-02" },
      { id: "s3-dup", fundamental_question_id: "q1", title: "Duplicada A", description: null, ...baseRow(), credits: 1, complexity: 1, importance: 1, estimated_load: 1, is_mandatory: 1, budgeted_xp: null, completed_at: null, completion_budgeted_xp: null, learning_stage_id: null, career_id: null, external_ref: "MAT-03" },
      { id: "s4-dup", fundamental_question_id: "q1", title: "Duplicada B", description: null, ...baseRow(), credits: 1, complexity: 1, importance: 1, estimated_load: 1, is_mandatory: 1, budgeted_xp: null, completed_at: null, completion_budgeted_xp: null, learning_stage_id: null, career_id: null, external_ref: "MAT-03" },
    );
    obsidianNotes.rows.push(
      noteRow({ id: "n1", sodiac_id: "s1", note_type: "materia" }),
      noteRow({ id: "n2", sodiac_id: null, note_type: "guía" }),
      noteRow({ id: "n3", vault_relative_path: "05_Temas/T-99 - raro.md", note_type: "diagnóstico", sodiac_id: null }),
    );

    const audit = await computeAcademicIntegrityAudit();

    expect(audit.subjectsWithoutNote).toEqual(["Sin nota y con FK rota", "Duplicada A", "Duplicada B"]);
    expect(audit.duplicateExternalRefs).toEqual([{ table: "subject", externalRef: "MAT-03", count: 2 }]);
    expect(audit.brokenSubjectQuestionRefs).toBe(1);
    expect(audit.notesLookingLikeTopicsButUntyped).toEqual(["05_Temas/T-99 - raro.md"]);
    expect(audit.totalNotes).toBe(3);
    expect(audit.notesWithSodiacId).toBe(1);
  });

  it("no reporta nada cuando todo está consistente", async () => {
    subjects.rows.push({ id: "s1", fundamental_question_id: "q1", title: "Ok", description: null, ...baseRow(), credits: 1, complexity: 1, importance: 1, estimated_load: 1, is_mandatory: 1, budgeted_xp: null, completed_at: null, completion_budgeted_xp: null, learning_stage_id: null, career_id: null, external_ref: "MAT-01" });
    obsidianNotes.rows.push(noteRow({ id: "n1", sodiac_id: "s1", note_type: "materia" }));

    const audit = await computeAcademicIntegrityAudit();

    expect(audit.subjectsWithoutNote).toEqual([]);
    expect(audit.duplicateExternalRefs).toEqual([]);
    expect(audit.brokenSubjectQuestionRefs).toBe(0);
    expect(audit.brokenTopicCompetencyRefs).toBe(0);
  });
});

describe("listReconciliationCandidates + importación selectiva (sección 22)", () => {
  it("marca confianza alta cuando todo resuelve, y baja cuando la materia de un tema no existe", async () => {
    obsidianNotes.rows.push(
      noteRow({
        id: "note-mat1",
        note_type: "materia",
        title: "MAT-01 - Lógica",
        frontmatter_json: JSON.stringify({ tipo: "materia", id: "MAT-01", preguntas: ["PF-01"] }),
      }),
      noteRow({
        id: "note-t1",
        note_type: "tema",
        title: "T-01.01 - Argumentos",
        frontmatter_json: JSON.stringify({ tipo: "tema", id: "T-01.01", materia: "MAT-01" }),
      }),
      noteRow({
        id: "note-t-huerfano",
        note_type: "tema",
        title: "T-99.01 - Huérfano",
        frontmatter_json: JSON.stringify({ tipo: "tema", id: "T-99.01", materia: "MAT-99-inexistente" }),
      }),
    );

    const candidates = await listReconciliationCandidates();
    const byRef = new Map(candidates.map((c) => [c.externalRef, c]));

    expect(byRef.get("MAT-01")!.confidence).toBe("alta");
    expect(byRef.get("MAT-01")!.proposedAction).toBe("crear");
    // T-01.01 resuelve porque MAT-01 es candidata en esta misma corrida.
    expect(byRef.get("T-01.01")!.confidence).toBe("alta");
    expect(byRef.get("T-99.01")!.confidence).toBe("baja");
    expect(byRef.get("T-99.01")!.proposedAction).toBe("revisar_manualmente");
  });

  it("la importación selectiva solo crea lo que el usuario aprobó", async () => {
    obsidianNotes.rows.push(
      noteRow({
        id: "note-mat1",
        note_type: "materia",
        title: "MAT-01 - Aprobada",
        frontmatter_json: JSON.stringify({ tipo: "materia", id: "MAT-01", preguntas: ["PF-01"] }),
      }),
      noteRow({
        id: "note-mat2",
        note_type: "materia",
        title: "MAT-02 - No aprobada",
        frontmatter_json: JSON.stringify({ tipo: "materia", id: "MAT-02", preguntas: ["PF-01"] }),
      }),
    );

    const summary = await importCareerFromObsidian({ onlyExternalRefs: new Set(["MAT-01"]) });

    expect(summary.subjectsCreated).toBe(1);
    expect(subjects.rows).toHaveLength(1);
    expect(subjects.rows[0]!.external_ref).toBe("MAT-01");
  });
});

describe("clearBrokenTopicCompetencyRefs (Fase N) — única acción correctiva automática segura", () => {
  it("limpia solo las referencias rotas, deja intactas las válidas", async () => {
    competencies.rows.push({
      id: "c-valida",
      fundamental_question_id: null,
      code: "COMP-01",
      title: "Válida",
      description: null,
      level_group: 0,
      evidence_hint: null,
      origin: "curriculum",
      external_ref: "COMP-01",
      ...baseRow(),
    });
    topics.rows.push(
      { id: "t-rota", subject_id: "s1", competency_id: "c-inexistente", learning_stage_id: null, curriculum_unit_id: null, title: "Tema con FK rota", description: null, completed_at: null, external_ref: null, ...baseRow() },
      { id: "t-ok", subject_id: "s1", competency_id: "c-valida", learning_stage_id: null, curriculum_unit_id: null, title: "Tema con FK válida", description: null, completed_at: null, external_ref: null, ...baseRow() },
    );

    const cleared = await clearBrokenTopicCompetencyRefs();

    expect(cleared).toBe(1);
    expect(topics.rows.find((t) => t.id === "t-rota")!.competency_id).toBeNull();
    expect(topics.rows.find((t) => t.id === "t-ok")!.competency_id).toBe("c-valida");
  });
});
