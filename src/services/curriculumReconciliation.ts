/**
 * Reconciliación entre la Carrera (SQLite) y el currículo real ya indexado
 * desde Obsidian (Fase I/J — ver docs/MASTER_SCHEDULE_MAP_AUDIT.md).
 *
 * Lee `obsidian_note.frontmatter_json`, que el indexador de Obsidian
 * (src/services/obsidian) ya parsea en cada sincronización — no vuelve a
 * tocar el filesystem del vault. Solo agrega filas nuevas (materias, temas,
 * competencias de currículo) y completa columnas que estaban en NULL
 * (`external_ref`, `obsidian_note.sodiac_id`); nunca borra ni modifica el
 * id de una fila existente. Es idempotente: si se ejecuta dos veces, la
 * segunda vez no crea duplicados (se salta todo lo que ya tiene
 * `external_ref`).
 */
import {
  competenciesRepo,
  curriculumDependenciesRepo,
  fundamentalQuestionsRepo,
  obsidianNotesRepo,
  subjectCompetenciesRepo,
  subjectFundamentalQuestionsRepo,
  subjectsRepo,
  topicCompetenciesRepo,
  topicFundamentalQuestionsRepo,
  topicsRepo,
} from "@/database/entities";
import type { CompetencyRow, SubjectRow, TopicRow } from "@/database/types";

const now = () => new Date().toISOString();

/** "MAT-01 - Lógica..." -> "Lógica...". Todas las notas de currículo del vault siguen este patrón. */
function stripIdPrefix(title: string | null, id: string): string {
  if (!title) return id;
  const prefix = `${id} - `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

interface Frontmatter {
  tipo?: string;
  id?: string;
  materia?: string;
  preguntas?: string[];
  competencias?: string[];
  estado?: string;
  [key: string]: unknown;
}

function parseFrontmatter(json: string | null): Frontmatter | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Frontmatter;
  } catch {
    return null;
  }
}

/** PF-01..PF-06 (vault) <-> PF1..PF6 (SQLite, cargados en la Fase C). Mapeo explícito, no inferido. */
const PF_VAULT_TO_SQLITE_CODE: Record<string, string> = {
  "PF-01": "PF1",
  "PF-02": "PF2",
  "PF-03": "PF3",
  "PF-04": "PF4",
  "PF-05": "PF5",
  "PF-06": "PF6",
};

export interface ReconciliationSummary {
  questionsLinked: number;
  competenciesCreated: number;
  competenciesSkipped: number;
  subjectsCreated: number;
  subjectsSkipped: number;
  topicsCreated: number;
  topicsSkipped: number;
  notesLinked: number;
  creditsRecalculated: number;
  unresolved: string[];
}

export interface ReconciliationPreview {
  questionsToLink: number;
  competenciesToCreate: number;
  subjectsToCreate: number;
  topicsToCreate: number;
  alreadyReconciled: boolean;
}

/** Vista previa sin escribir nada — para mostrar antes de confirmar la importación. */
export async function previewReconciliation(): Promise<ReconciliationPreview> {
  const [questions, competencies, subjects, topics, notes] = await Promise.all([
    fundamentalQuestionsRepo.list(),
    competenciesRepo.list(),
    subjectsRepo.list(),
    topicsRepo.list(),
    obsidianNotesRepo.list(),
  ]);

  const questionsToLink = questions.filter((q) => !q.external_ref).length;
  const existingCompetencyRefs = new Set(competencies.map((c) => c.external_ref).filter(Boolean));
  const existingSubjectRefs = new Set(subjects.map((s) => s.external_ref).filter(Boolean));
  const existingTopicRefs = new Set(topics.map((t) => t.external_ref).filter(Boolean));

  let competenciesToCreate = 0;
  let subjectsToCreate = 0;
  let topicsToCreate = 0;
  for (const note of notes) {
    const fm = parseFrontmatter(note.frontmatter_json);
    if (!fm?.id || !fm.tipo) continue;
    if (fm.tipo === "competencia" && !existingCompetencyRefs.has(fm.id)) competenciesToCreate++;
    if (fm.tipo === "materia" && !existingSubjectRefs.has(fm.id)) subjectsToCreate++;
    if (fm.tipo === "tema" && !existingTopicRefs.has(fm.id)) topicsToCreate++;
  }

  return {
    questionsToLink,
    competenciesToCreate,
    subjectsToCreate,
    topicsToCreate,
    alreadyReconciled:
      questionsToLink === 0 && competenciesToCreate === 0 && subjectsToCreate === 0 && topicsToCreate === 0,
  };
}

export type ReconciliationConfidence = "alta" | "media" | "baja";
export type ReconciliationAction = "crear" | "revisar_manualmente";

export interface ReconciliationCandidate {
  noteId: string;
  externalRef: string; // MAT-XX / T-XX.YY / COMP-XX
  vaultRelativePath: string;
  title: string;
  detectedType: "materia" | "tema" | "competencia";
  materiaRef: string | null; // solo para temas
  questionRefs: string[];
  competencyRefs: string[];
  confidence: ReconciliationConfidence;
  proposedAction: ReconciliationAction;
  reason: string | null; // por qué la confianza no es "alta" o por qué se propone revisión manual
}

/**
 * Asistente de revisión (sección 22 del pedido): a diferencia de
 * `previewReconciliation` (solo conteos), esto arma la lista candidato por
 * candidato para que el usuario apruebe antes de crear nada — pensado para
 * cuando el vault se vuelva a sincronizar más adelante y aparezcan temas o
 * materias nuevas, no para la primera carga masiva (esa ya se hizo y quedó
 * verificada). Nunca escribe nada — es de solo lectura, igual que
 * `previewReconciliation`.
 */
export async function listReconciliationCandidates(): Promise<ReconciliationCandidate[]> {
  const [questions, competencies, subjects, topics, notes] = await Promise.all([
    fundamentalQuestionsRepo.list(),
    competenciesRepo.list(),
    subjectsRepo.list(),
    topicsRepo.list(),
    obsidianNotesRepo.list(),
  ]);

  const knownQuestionRefs = new Set(
    Object.keys(PF_VAULT_TO_SQLITE_CODE).filter((vaultCode) =>
      questions.some((q) => q.code === PF_VAULT_TO_SQLITE_CODE[vaultCode]),
    ),
  );
  const existingCompetencyRefs = new Set(competencies.map((c) => c.external_ref).filter(Boolean));
  const existingSubjectRefs = new Set(subjects.map((s) => s.external_ref).filter(Boolean));
  const existingTopicRefs = new Set(topics.map((t) => t.external_ref).filter(Boolean));
  // Materias que YA existen o que son candidatas en esta misma corrida —
  // un tema puede depender de una materia que todavía no se creó.
  const subjectRefsIncludingCandidates = new Set(existingSubjectRefs);
  for (const note of notes) {
    const fm = parseFrontmatter(note.frontmatter_json);
    if (fm?.tipo === "materia" && fm.id) subjectRefsIncludingCandidates.add(fm.id);
  }

  const candidates: ReconciliationCandidate[] = [];

  for (const note of notes) {
    const fm = parseFrontmatter(note.frontmatter_json);
    if (!fm?.id || !fm.tipo) continue;

    if (fm.tipo === "competencia" && !existingCompetencyRefs.has(fm.id)) {
      candidates.push({
        noteId: note.id,
        externalRef: fm.id,
        vaultRelativePath: note.vault_relative_path,
        title: stripIdPrefix(note.title, fm.id),
        detectedType: "competencia",
        materiaRef: null,
        questionRefs: [],
        competencyRefs: [],
        confidence: "alta",
        proposedAction: "crear",
        reason: null,
      });
    }

    if (fm.tipo === "materia" && !existingSubjectRefs.has(fm.id)) {
      const preguntas = Array.isArray(fm.preguntas) ? fm.preguntas : [];
      const unresolvedQuestions = preguntas.filter((p) => !knownQuestionRefs.has(p));
      const hasPrimaryQuestion = preguntas.length > 0 && preguntas.some((p) => knownQuestionRefs.has(p));
      candidates.push({
        noteId: note.id,
        externalRef: fm.id,
        vaultRelativePath: note.vault_relative_path,
        title: stripIdPrefix(note.title, fm.id),
        detectedType: "materia",
        materiaRef: null,
        questionRefs: preguntas,
        competencyRefs: Array.isArray(fm.competencias) ? fm.competencias : [],
        confidence: hasPrimaryQuestion ? (unresolvedQuestions.length === 0 ? "alta" : "media") : "baja",
        proposedAction: hasPrimaryQuestion ? "crear" : "revisar_manualmente",
        reason: hasPrimaryQuestion
          ? unresolvedQuestions.length > 0
            ? `Preguntas sin resolver: ${unresolvedQuestions.join(", ")}`
            : null
          : "No se pudo resolver ninguna pregunta fundamental primaria.",
      });
    }

    if (fm.tipo === "tema" && !existingTopicRefs.has(fm.id)) {
      const materiaRef = fm.materia ?? null;
      const materiaResolvable = materiaRef ? subjectRefsIncludingCandidates.has(materiaRef) : false;
      candidates.push({
        noteId: note.id,
        externalRef: fm.id,
        vaultRelativePath: note.vault_relative_path,
        title: stripIdPrefix(note.title, fm.id),
        detectedType: "tema",
        materiaRef,
        questionRefs: Array.isArray(fm.preguntas) ? fm.preguntas : [],
        competencyRefs: Array.isArray(fm.competencias) ? fm.competencias : [],
        confidence: materiaResolvable ? "alta" : "baja",
        proposedAction: materiaResolvable ? "crear" : "revisar_manualmente",
        reason: materiaResolvable ? null : `La materia "${materiaRef ?? "(sin declarar)"}" no se pudo resolver.`,
      });
    }
  }

  return candidates;
}

export interface ImportCareerOptions {
  /**
   * Si se pasa, solo se crean las filas cuyo `external_ref` esté en este
   * conjunto — usado por el asistente de revisión (sección 22) para
   * importar solo lo que el usuario aprobó candidato por candidato. Sin
   * esta opción (comportamiento por defecto, usado en la reconciliación
   * inicial) se importa todo lo detectado, como hasta ahora.
   */
  onlyExternalRefs?: Set<string>;
}

/**
 * Ejecuta la importación reconciliada. Idempotente: correrla de nuevo tras
 * sincronizar el vault solo agrega lo que sea realmente nuevo.
 */
export async function importCareerFromObsidian(options: ImportCareerOptions = {}): Promise<ReconciliationSummary> {
  const { onlyExternalRefs } = options;
  const isApproved = (externalRef: string) => !onlyExternalRefs || onlyExternalRefs.has(externalRef);
  const summary: ReconciliationSummary = {
    questionsLinked: 0,
    competenciesCreated: 0,
    competenciesSkipped: 0,
    subjectsCreated: 0,
    subjectsSkipped: 0,
    topicsCreated: 0,
    topicsSkipped: 0,
    notesLinked: 0,
    creditsRecalculated: 0,
    unresolved: [],
  };

  const [questions, existingCompetencies, existingSubjects, existingTopics, notes] = await Promise.all([
    fundamentalQuestionsRepo.list(),
    competenciesRepo.list(),
    subjectsRepo.list(),
    topicsRepo.list(),
    obsidianNotesRepo.list(),
  ]);

  // 1) Backfill de fundamental_question.external_ref (mapeo explícito PF-0N <-> PFN).
  const questionByCode = new Map(questions.map((q) => [q.code, q]));
  const questionByExternalRef = new Map<string, (typeof questions)[number]>();
  for (const [vaultCode, sqliteCode] of Object.entries(PF_VAULT_TO_SQLITE_CODE)) {
    const row = questionByCode.get(sqliteCode);
    if (!row) {
      summary.unresolved.push(`Pregunta fundamental sin fila en SQLite: ${sqliteCode} (vault: ${vaultCode})`);
      continue;
    }
    questionByExternalRef.set(vaultCode, row);
    if (!row.external_ref) {
      await fundamentalQuestionsRepo.update(row.id, { external_ref: vaultCode }, "sistema");
      summary.questionsLinked++;
    }
  }

  // 2) Competencias del vault (COMP-01..10) — nuevas filas, origin='curriculum'.
  //    No se les asigna fundamental_question_id: el vault no declara ese
  //    vínculo a nivel de la nota "competencia" (ver docs/MASTER_SCHEDULE_MAP_AUDIT.md §5).
  const competencyByExternalRef = new Map<string, CompetencyRow>();
  for (const c of existingCompetencies) {
    if (c.external_ref) competencyByExternalRef.set(c.external_ref, c);
  }
  const competencyNotes = notes.filter((n) => {
    const fm = parseFrontmatter(n.frontmatter_json);
    return fm?.tipo === "competencia" && !!fm.id && isApproved(fm.id);
  });
  for (const note of competencyNotes) {
    const fm = parseFrontmatter(note.frontmatter_json);
    if (!fm?.id) continue;
    if (competencyByExternalRef.has(fm.id)) {
      summary.competenciesSkipped++;
      continue;
    }
    const row: CompetencyRow = {
      id: crypto.randomUUID(),
      fundamental_question_id: null,
      code: fm.id,
      title: stripIdPrefix(note.title, fm.id),
      description: null,
      level_group: 0,
      evidence_hint: null,
      origin: "curriculum",
      external_ref: fm.id,
      status: "activa",
      sort_order: 0,
      notes: null,
      tags: null,
      created_at: now(),
      updated_at: now(),
      archived_at: null,
    };
    await competenciesRepo.insert(row, "sistema");
    competencyByExternalRef.set(fm.id, row);
    summary.competenciesCreated++;
  }

  // 3) Materias del vault (MAT-01..30) — nuevas filas de subject.
  const subjectByExternalRef = new Map<string, SubjectRow>();
  for (const s of existingSubjects) {
    if (s.external_ref) subjectByExternalRef.set(s.external_ref, s);
  }
  const subjectNotes = notes.filter((n) => {
    const fm = parseFrontmatter(n.frontmatter_json);
    return fm?.tipo === "materia" && !!fm.id && isApproved(fm.id);
  });
  for (const note of subjectNotes) {
    const fm = parseFrontmatter(note.frontmatter_json);
    if (!fm?.id) continue;
    if (subjectByExternalRef.has(fm.id)) {
      summary.subjectsSkipped++;
      continue;
    }
    const preguntas = Array.isArray(fm.preguntas) ? fm.preguntas : [];
    const primaryQuestion = preguntas[0] ? questionByExternalRef.get(preguntas[0]) : undefined;
    if (!primaryQuestion) {
      summary.unresolved.push(
        `Materia ${fm.id}: no se pudo resolver una pregunta fundamental primaria (preguntas=[${preguntas.join(", ")}]) — omitida, no se inventó un vínculo.`,
      );
      continue;
    }

    const sortOrder = Number(fm.id.replace(/\D/g, "")) || 0;
    const row: SubjectRow = {
      id: crypto.randomUUID(),
      fundamental_question_id: primaryQuestion.id,
      title: stripIdPrefix(note.title, fm.id),
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
      external_ref: fm.id,
      status: "activa",
      sort_order: sortOrder,
      notes: null,
      tags: null,
      created_at: now(),
      updated_at: now(),
      archived_at: null,
    };
    await subjectsRepo.insert(row, "sistema");
    subjectByExternalRef.set(fm.id, row);
    summary.subjectsCreated++;

    for (const pf of preguntas) {
      const q = questionByExternalRef.get(pf);
      if (!q) continue;
      await subjectFundamentalQuestionsRepo.insert(
        { id: crypto.randomUUID(), subject_id: row.id, fundamental_question_id: q.id, created_at: now() },
        "sistema",
      );
    }
    const competencias = Array.isArray(fm.competencias) ? fm.competencias : [];
    for (const comp of competencias) {
      const c = competencyByExternalRef.get(comp);
      if (!c) continue;
      await subjectCompetenciesRepo.insert(
        { id: crypto.randomUUID(), subject_id: row.id, competency_id: c.id, created_at: now() },
        "sistema",
      );
    }
  }

  // 4) Temas del vault (T-XX.YY) — nuevas filas de topic.
  const topicByExternalRef = new Map<string, TopicRow>();
  for (const t of existingTopics) {
    if (t.external_ref) topicByExternalRef.set(t.external_ref, t);
  }
  const topicNotes = notes.filter((n) => {
    const fm = parseFrontmatter(n.frontmatter_json);
    return fm?.tipo === "tema" && !!fm.id && isApproved(fm.id);
  });
  for (const note of topicNotes) {
    const fm = parseFrontmatter(note.frontmatter_json);
    if (!fm?.id || !fm.materia) continue;
    if (topicByExternalRef.has(fm.id)) {
      summary.topicsSkipped++;
      continue;
    }
    const subject = subjectByExternalRef.get(fm.materia);
    if (!subject) {
      summary.unresolved.push(`Tema ${fm.id}: materia ${fm.materia} sin resolver`);
      continue;
    }
    const competencias = Array.isArray(fm.competencias) ? fm.competencias : [];
    const primaryCompetency = competencias[0] ? competencyByExternalRef.get(competencias[0]) : undefined;

    const sortMatch = fm.id.match(/\.(\d+)$/);
    const sortOrder = sortMatch ? Number(sortMatch[1]) : 0;

    const row: TopicRow = {
      id: crypto.randomUUID(),
      subject_id: subject.id,
      competency_id: primaryCompetency?.id ?? null,
      learning_stage_id: null,
      curriculum_unit_id: null,
      title: stripIdPrefix(note.title, fm.id),
      description: null,
      completed_at: null,
      external_ref: fm.id,
      status: "activa",
      sort_order: sortOrder,
      notes: null,
      tags: null,
      created_at: now(),
      updated_at: now(),
      archived_at: null,
    };
    await topicsRepo.insert(row, "sistema");
    topicByExternalRef.set(fm.id, row);
    summary.topicsCreated++;

    const preguntas = Array.isArray(fm.preguntas) ? fm.preguntas : [];
    for (const pf of preguntas) {
      const q = questionByExternalRef.get(pf);
      if (!q) continue;
      await topicFundamentalQuestionsRepo.insert(
        { id: crypto.randomUUID(), topic_id: row.id, fundamental_question_id: q.id, created_at: now() },
        "sistema",
      );
    }
    for (const comp of competencias) {
      const c = competencyByExternalRef.get(comp);
      if (!c) continue;
      await topicCompetenciesRepo.insert(
        { id: crypto.randomUUID(), topic_id: row.id, competency_id: c.id, created_at: now() },
        "sistema",
      );
    }
  }

  // 5) Backfill de obsidian_note.sodiac_id por coincidencia de external_ref.
  const allRefs = new Map<string, string>();
  for (const [ref, row] of questionByExternalRef) allRefs.set(ref, row.id);
  for (const [ref, row] of competencyByExternalRef) allRefs.set(ref, row.id);
  for (const [ref, row] of subjectByExternalRef) allRefs.set(ref, row.id);
  for (const [ref, row] of topicByExternalRef) allRefs.set(ref, row.id);

  for (const note of notes) {
    if (note.sodiac_id) continue;
    const fm = parseFrontmatter(note.frontmatter_json);
    if (!fm?.id) continue;
    const sodiacId = allRefs.get(fm.id);
    if (!sodiacId) continue;
    await obsidianNotesRepo.update(note.id, { sodiac_id: sodiacId }, "sistema");
    summary.notesLinked++;
  }

  // 6) Créditos proporcionales al contenido real (decisión del usuario: las
  // materias con más temas otorgan más XP total y son más difíciles de
  // completar/subir de nivel que las de pocos temas — no todas valen lo
  // mismo). Cubre TODAS las materias activas (las 9 legacy y las 30 del
  // vault), no solo las recién creadas en este ciclo, para que quede
  // corregido de una vez y se mantenga correcto en cada re-sync futuro.
  summary.creditsRecalculated = await recalculateSubjectCredits();

  return summary;
}

/**
 * credits ∝ cantidad de temas activos de la materia, normalizado al rango
 * 1-5 (la columna tiene `CHECK (credits BETWEEN 1 AND 5)` desde la Fase 5 —
 * no se toca ese constraint). Es la única señal real y no inventada de
 * "contenido"/"complejidad" disponible hoy: complexity/importance/
 * estimated_load están en 1 o 3 para todas las materias de un mismo
 * origen, sin variación real entre ellas (ver docs/MASTER_SCHEDULE_MAP_AUDIT.md,
 * auditoría O0). Normalización min-max: la materia con menos temas activos
 * queda en 1, la de más temas en 5, el resto interpolado — así una materia
 * de 3 temas y otra de 20 no valen lo mismo, y dentro de las 30 materias del
 * vault (12-20 temas) también hay variación en vez de un crédito plano.
 * No toca `budgeted_xp`/`completion_budgeted_xp` (se recalculan solos, en
 * vivo, la próxima vez que se previsualice/otorgue XP — ver
 * computeSubjectBudgetShare en xp.ts) ni ninguna otra columna.
 */
export async function recalculateSubjectCredits(): Promise<number> {
  const [subjects, topics] = await Promise.all([
    subjectsRepo.list({ where: "archived_at IS NULL" }),
    topicsRepo.list({ where: "archived_at IS NULL" }),
  ]);
  const topicCountBySubject = new Map<string, number>();
  for (const t of topics) {
    topicCountBySubject.set(t.subject_id, (topicCountBySubject.get(t.subject_id) ?? 0) + 1);
  }
  const counts = subjects.map((s) => topicCountBySubject.get(s.id) ?? 0);
  const min = counts.length > 0 ? Math.min(...counts) : 0;
  const max = counts.length > 0 ? Math.max(...counts) : 0;

  let changed = 0;
  for (const s of subjects) {
    const count = topicCountBySubject.get(s.id) ?? 0;
    const newCredits =
      max === min ? 3 : Math.min(5, Math.max(1, 1 + Math.round((4 * (count - min)) / (max - min))));
    if (s.credits !== newCredits) {
      await subjectsRepo.update(s.id, { credits: newCredits }, "sistema");
      changed++;
    }
  }
  return changed;
}

export interface SequentialDependencyResult {
  created: number;
  skipped: number;
}

/**
 * Formaliza en `curriculum_dependency` (tabla ya existente, reutilizada de
 * la Fase C, nunca usada hasta ahora — 0 filas) el mismo orden secuencial
 * que ya usa el Cronograma Maestro: dentro de cada materia, el tema N
 * "requires" al tema N-1 (por `sort_order`). No es una relación inventada
 * — es la que ya se le muestra al usuario como "próximo paso" en toda la
 * app; esto solo la vuelve una fila real y consultable en vez de un
 * cálculo implícito. Cubre todas las materias activas (las 30 del vault y
 * las 9 legacy), no solo las recién importadas. Idempotente: no duplica
 * una dependencia que ya exista entre el mismo par de temas.
 */
export async function generateSequentialDependencies(): Promise<SequentialDependencyResult> {
  const [subjects, topics, existing] = await Promise.all([
    subjectsRepo.list({ where: "archived_at IS NULL" }),
    topicsRepo.list({ where: "archived_at IS NULL" }),
    curriculumDependenciesRepo.list(),
  ]);

  const existingPairs = new Set(existing.map((d) => `${d.from_topic_id}->${d.to_topic_id}`));
  const topicsBySubject = new Map<string, TopicRow[]>();
  for (const t of topics) {
    const list = topicsBySubject.get(t.subject_id) ?? [];
    list.push(t);
    topicsBySubject.set(t.subject_id, list);
  }

  const result: SequentialDependencyResult = { created: 0, skipped: 0 };
  const now = () => new Date().toISOString();

  for (const subject of subjects) {
    const subjectTopics = (topicsBySubject.get(subject.id) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
    );
    for (let i = 1; i < subjectTopics.length; i++) {
      const from = subjectTopics[i - 1]!;
      const to = subjectTopics[i]!;
      const key = `${from.id}->${to.id}`;
      if (existingPairs.has(key)) {
        result.skipped++;
        continue;
      }
      await curriculumDependenciesRepo.insert(
        {
          id: crypto.randomUUID(),
          from_topic_id: from.id,
          to_topic_id: to.id,
          dependency_type: "requires",
          status: "activo",
          notes: "Generado automáticamente a partir del orden secuencial dentro de la materia.",
          created_at: now(),
          updated_at: now(),
        },
        "sistema",
      );
      existingPairs.add(key);
      result.created++;
    }
  }

  return result;
}

export interface AcademicIntegrityAudit {
  totalNotes: number;
  notesWithSodiacId: number;
  notesWithoutSodiacId: number;
  subjectsWithoutNote: string[]; // títulos de materias importadas del vault sin nota vinculada
  topicsWithoutNote: string[]; // primeros N títulos, ver topicsWithoutNoteCount para el total
  topicsWithoutNoteCount: number;
  notesLookingLikeTopicsButUntyped: string[]; // rutas en 05_Temas/ cuyo note_type no es "tema"
  duplicateExternalRefs: { table: string; externalRef: string; count: number }[];
  brokenTopicCompetencyRefs: number; // topic.competency_id que no existe en competency
  brokenSubjectQuestionRefs: number; // subject.fundamental_question_id que no existe en fundamental_question
}

/**
 * Diagnóstico de integridad (sección 12 del pedido): solo lectura, no
 * corrige nada — sirve para decidir si hace falta re-sincronizar el vault,
 * revisar notas puntuales, o si todo sigue consistente después de importar.
 */
export async function computeAcademicIntegrityAudit(): Promise<AcademicIntegrityAudit> {
  const [notes, subjects, topics, competencies, questions] = await Promise.all([
    obsidianNotesRepo.list(),
    subjectsRepo.list({ where: "archived_at IS NULL" }),
    topicsRepo.list({ where: "archived_at IS NULL" }),
    competenciesRepo.list({ where: "archived_at IS NULL" }),
    fundamentalQuestionsRepo.list({ where: "archived_at IS NULL" }),
  ]);

  const sodiacIds = new Set(notes.map((n) => n.sodiac_id).filter((id): id is string => !!id));
  const competencyIds = new Set(competencies.map((c) => c.id));
  const questionIds = new Set(questions.map((q) => q.id));

  const subjectsWithoutNote = subjects.filter((s) => s.external_ref && !sodiacIds.has(s.id)).map((s) => s.title);
  const topicsWithoutNoteAll = topics.filter((t) => t.external_ref && !sodiacIds.has(t.id)).map((t) => t.title);

  const notesLookingLikeTopicsButUntyped = notes
    .filter((n) => n.vault_relative_path.startsWith("05_Temas/") && n.note_type !== "tema")
    .map((n) => n.vault_relative_path);

  const duplicateExternalRefs: AcademicIntegrityAudit["duplicateExternalRefs"] = [];
  function checkDuplicates(table: string, rows: { external_ref?: string | null }[]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.external_ref) continue;
      counts.set(row.external_ref, (counts.get(row.external_ref) ?? 0) + 1);
    }
    for (const [externalRef, count] of counts) {
      if (count > 1) duplicateExternalRefs.push({ table, externalRef, count });
    }
  }
  checkDuplicates("subject", subjects);
  checkDuplicates("topic", topics);
  checkDuplicates("competency", competencies);
  checkDuplicates("fundamental_question", questions);

  const brokenTopicCompetencyRefs = topics.filter((t) => t.competency_id && !competencyIds.has(t.competency_id)).length;
  const brokenSubjectQuestionRefs = subjects.filter(
    (s) => s.fundamental_question_id && !questionIds.has(s.fundamental_question_id),
  ).length;

  return {
    totalNotes: notes.length,
    notesWithSodiacId: sodiacIds.size,
    notesWithoutSodiacId: notes.length - notes.filter((n) => n.sodiac_id).length,
    subjectsWithoutNote,
    topicsWithoutNote: topicsWithoutNoteAll.slice(0, 20),
    topicsWithoutNoteCount: topicsWithoutNoteAll.length,
    notesLookingLikeTopicsButUntyped,
    duplicateExternalRefs,
    brokenTopicCompetencyRefs,
    brokenSubjectQuestionRefs,
  };
}

/**
 * Única acción correctiva automática segura del panel de integridad:
 * `topic.competency_id` es nullable, así que una referencia rota (apunta a
 * una competencia que ya no existe) se puede limpiar sin inventar un
 * reemplazo. `subject.fundamental_question_id` en cambio es NOT NULL —
 * limpiarlo requeriría elegir una pregunta al azar, así que esa
 * inconsistencia queda solo diagnosticada, para que el usuario la
 * reasigne a mano (ver EntityDetailPanel / SubjectDetailPage).
 */
export async function clearBrokenTopicCompetencyRefs(): Promise<number> {
  const [topics, competencies] = await Promise.all([
    topicsRepo.list({ where: "archived_at IS NULL" }),
    competenciesRepo.list({ where: "archived_at IS NULL" }),
  ]);
  const competencyIds = new Set(competencies.map((c) => c.id));
  const broken = topics.filter((t) => t.competency_id && !competencyIds.has(t.competency_id));
  for (const topic of broken) {
    await topicsRepo.update(topic.id, { competency_id: null }, "sistema");
  }
  return broken.length;
}
