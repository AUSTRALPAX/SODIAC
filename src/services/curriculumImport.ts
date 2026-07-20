import {
  careersRepo,
  curriculumActivitiesRepo,
  curriculumUnitsRepo,
  fundamentalQuestionsRepo,
  learningStagesRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import type { CareerRow, CurriculumActivityRow, CurriculumUnitRow, LearningStageRow, SubjectRow, TopicRow } from "@/database/types";
import {
  validateCurriculumImport,
  type CurriculumImportData,
  type CurriculumImportValidationResult,
} from "@/schemas/curriculumImport";
import { recalculateSubjectCredits } from "@/services/curriculumReconciliation";

const now = () => new Date().toISOString();

/**
 * Normaliza un título para comparar contra registros existentes y evitar
 * duplicados (mismo criterio que `normalizeKey` en services/libraryImport.ts,
 * adaptado a un solo campo). El texto visible original nunca se altera.
 */
function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['".,;:-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- 1. Parsers: cada formato produce el mismo objeto crudo, validado luego por validateCurriculumImport ---

export function parseCurriculumJson(text: string): unknown {
  return JSON.parse(text);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Formato CSV "largo": una fila por entidad, columna `type` indica
 * career/stage/subject/unit/topic/activity. `parent_code` significa algo
 * distinto según el tipo (etapa para materias, materia para unidades/temas,
 * tema para actividades) — ver tests/fixtures/curriculum-sample.csv.
 */
export function parseCurriculumCsv(text: string): unknown {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("El CSV está vacío.");
  const header = parseCsvLine(lines[0]!).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = (values[i] ?? "").trim();
    });
    return row;
  });

  const num = (v: string) => (v ? Number(v) : null);
  const str = (v: string) => (v ? v : null);

  const data: CurriculumImportData = {
    career: { title: "", versionLabel: "", totalXpBudget: null },
    stages: [],
    subjects: [],
    units: [],
    topics: [],
    activities: [],
  };

  for (const row of rows) {
    switch (row.type) {
      case "career":
        data.career = {
          title: row.title ?? "",
          versionLabel: row.version_label ?? "",
          totalXpBudget: num(row.total_xp_budget ?? ""),
        };
        break;
      case "stage":
        data.stages.push({
          code: row.code!,
          title: row.title!,
          description: str(row.description ?? ""),
          orientativeDuration: str(row.orientative_duration ?? ""),
          mainProduct: str(row.main_product ?? ""),
          sortOrder: num(row.sort_order ?? "") ?? 0,
        });
        break;
      case "subject":
        data.subjects.push({
          code: row.code!,
          stageCode: str(row.parent_code ?? ""),
          fundamentalQuestionCode: str(row.fq_code ?? ""),
          title: row.title!,
          description: str(row.description ?? ""),
          credits: num(row.credits ?? "") ?? 3,
        });
        break;
      case "unit":
        data.units.push({
          code: row.code!,
          subjectCode: row.parent_code!,
          title: row.title!,
          description: str(row.description ?? ""),
          budgetedXp: num(row.budgeted_xp ?? ""),
        });
        break;
      case "topic":
        data.topics.push({
          code: str(row.code ?? ""),
          subjectCode: row.parent_code!,
          unitCode: str(row.unit_code ?? ""),
          title: row.title!,
          description: str(row.description ?? ""),
        });
        break;
      case "activity":
        data.activities.push({
          topicCode: row.parent_code!,
          title: row.title!,
          activityType: row.activity_type || "estudio",
          estimatedMinutes: num(row.estimated_minutes ?? ""),
          scheduledDate: str(row.scheduled_date ?? ""),
        });
        break;
      default:
        throw new Error(`Fila de tipo desconocido en el CSV: "${row.type}".`);
    }
  }

  return data;
}

/**
 * Formato Markdown/PDF: esquema de encabezados anidados + lista. Ver
 * tests/fixtures/curriculum-sample.md para el formato exacto esperado. El
 * mismo parser se reutiliza para texto extraído de un PDF "estructurado"
 * (ver `extractPdfText`): una vez extraído el texto plano, debe seguir esta
 * misma convención de líneas para poder interpretarse.
 */
export function parseCurriculumMarkdown(text: string): unknown {
  const lines = text.split(/\r?\n/);
  const data: CurriculumImportData = {
    career: { title: "", versionLabel: "", totalXpBudget: null },
    stages: [],
    subjects: [],
    units: [],
    topics: [],
    activities: [],
  };

  let currentStageCode: string | null = null;
  let currentSubjectCode: string | null = null;
  let currentUnitCode: string | null = null;
  let currentTopicCode: string | null = null;
  let unitAutoCounter = 0;
  let topicAutoCounter = 0;

  const keyValue = (line: string): [string, string] | null => {
    const m = /^(\w+):\s*(.*)$/.exec(line.trim());
    return m ? [m[1]!, m[2]!.trim()] : null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    let m: RegExpExecArray | null;

    if ((m = /^#\s+(.+)$/.exec(line))) {
      data.career.title = m[1]!.trim();
      continue;
    }
    if ((m = /^##\s+Etapa:\s*([^|]+)\|(.+)$/.exec(line))) {
      currentStageCode = m[1]!.trim();
      data.stages.push({
        code: currentStageCode,
        title: m[2]!.trim(),
        description: null,
        orientativeDuration: null,
        mainProduct: null,
        sortOrder: data.stages.length,
      });
      continue;
    }
    if ((m = /^###\s+Materia:\s*([^|]+)\|(.+)$/.exec(line))) {
      currentSubjectCode = m[1]!.trim();
      currentUnitCode = null;
      data.subjects.push({
        code: currentSubjectCode,
        stageCode: currentStageCode,
        fundamentalQuestionCode: null,
        title: m[2]!.trim(),
        description: null,
        credits: 3,
      });
      continue;
    }
    if ((m = /^####\s+Unidad:\s*([^|]+)\|(.+)$/.exec(line))) {
      if (!currentSubjectCode) throw new Error(`Unidad "${m[2]}" sin materia previa en el documento.`);
      currentUnitCode = m[1]!.trim();
      data.units.push({
        code: currentUnitCode,
        subjectCode: currentSubjectCode,
        title: m[2]!.trim(),
        description: null,
        budgetedXp: null,
      });
      continue;
    }
    if ((m = /^-\s+Tema:\s*(?:([^|]+)\|)?(.+)$/.exec(line))) {
      if (!currentSubjectCode) throw new Error(`Tema "${m[2]}" sin materia previa en el documento.`);
      currentTopicCode = m[1] ? m[1].trim() : `__auto_topic_${topicAutoCounter++}`;
      data.topics.push({
        code: m[1] ? currentTopicCode : null,
        subjectCode: currentSubjectCode,
        unitCode: currentUnitCode,
        title: m[2]!.trim(),
        description: null,
      });
      continue;
    }
    if ((m = /^\s+-\s+Actividad:\s*(.+?)\s*\(([^)]*)\)\s*$/.exec(line))) {
      if (!currentTopicCode) throw new Error(`Actividad "${m[1]}" sin tema previo en el documento.`);
      const attrs = Object.fromEntries(
        m[2]!
          .split(",")
          .map((part) => part.split(":").map((s) => s.trim()))
          .filter((pair) => pair.length === 2) as [string, string][],
      );
      data.activities.push({
        topicCode: currentTopicCode,
        title: m[1]!.trim(),
        activityType: attrs.tipo || "estudio",
        estimatedMinutes: attrs.minutos ? Number(attrs.minutos) : null,
        scheduledDate: attrs.fecha || null,
      });
      continue;
    }

    const kv = keyValue(line);
    if (kv) {
      const [key, value] = kv;
      if (key === "version") data.career.versionLabel = value;
      else if (key === "xp_total") data.career.totalXpBudget = value ? Number(value) : null;
      else if (key === "duracion" && data.stages.length > 0) data.stages[data.stages.length - 1]!.orientativeDuration = value;
      else if (key === "producto" && data.stages.length > 0) data.stages[data.stages.length - 1]!.mainProduct = value;
      else if (key === "creditos" && data.subjects.length > 0) data.subjects[data.subjects.length - 1]!.credits = Number(value);
      else if (key === "fq" && data.subjects.length > 0) data.subjects[data.subjects.length - 1]!.fundamentalQuestionCode = value;
      else if (key === "xp" && data.units.length > 0) data.units[data.units.length - 1]!.budgetedXp = Number(value);
    }
  }
  void unitAutoCounter;

  return data;
}

/** Extrae texto plano de un PDF con pdfjs-dist — no hay utilidad reusable previa en el repo. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pageTexts.join("\n");
}

/**
 * "PDF estructurado" (pedido explícito del usuario): el texto extraído debe
 * seguir la misma convención de líneas que el formato Markdown. No es
 * reconocimiento de estructura visual del PDF — es una decisión de alcance
 * deliberada y explícita, no una limitación oculta.
 */
export async function parseCurriculumPdf(bytes: Uint8Array): Promise<unknown> {
  const text = await extractPdfText(bytes);
  return parseCurriculumMarkdown(text);
}

export function validateParsedCurriculum(raw: unknown): CurriculumImportValidationResult {
  return validateCurriculumImport(raw);
}

// --- 2. Preview: qué se creará y qué se actualizará, sin escribir nada ---

export interface CurriculumImportPreviewItem {
  kind: "career" | "stage" | "subject" | "unit" | "topic" | "activity";
  label: string;
  action: "crear" | "actualizar" | "sin_cambios";
}

export interface CurriculumImportPreview {
  items: CurriculumImportPreviewItem[];
  toCreate: number;
  toUpdate: number;
  unchanged: number;
}

async function existingStageByTitle(): Promise<Map<string, LearningStageRow>> {
  const rows = await learningStagesRepo.list();
  return new Map(rows.map((r) => [normalizeTitle(r.title), r]));
}
async function existingSubjectByTitle(): Promise<Map<string, SubjectRow>> {
  const rows = await subjectsRepo.list({ where: "archived_at IS NULL" });
  return new Map(rows.map((r) => [normalizeTitle(r.title), r]));
}
async function existingCareerByTitleVersion(): Promise<Map<string, CareerRow>> {
  const rows = await careersRepo.list();
  return new Map(rows.map((r) => [`${normalizeTitle(r.title)}::${r.version_label}`, r]));
}

export async function previewCurriculumImport(data: CurriculumImportData): Promise<CurriculumImportPreview> {
  const items: CurriculumImportPreviewItem[] = [];
  const [stagesByTitle, subjectsByTitle, careersByKey] = await Promise.all([
    existingStageByTitle(),
    existingSubjectByTitle(),
    existingCareerByTitleVersion(),
  ]);

  const careerKey = `${normalizeTitle(data.career.title)}::${data.career.versionLabel}`;
  items.push({
    kind: "career",
    label: `${data.career.title} (${data.career.versionLabel})`,
    action: careersByKey.has(careerKey) ? "sin_cambios" : "crear",
  });

  for (const s of data.stages) {
    items.push({ kind: "stage", label: s.title, action: stagesByTitle.has(normalizeTitle(s.title)) ? "sin_cambios" : "crear" });
  }
  for (const s of data.subjects) {
    const existing = subjectsByTitle.get(normalizeTitle(s.title));
    items.push({
      kind: "subject",
      label: s.title,
      action: !existing ? "crear" : existing.career_id ? "sin_cambios" : "actualizar",
    });
  }
  // Unidades, temas y actividades se resuelven en el momento de escribir
  // (dependen de qué materia/tema termine resolviéndose) — para la previsualización
  // se cuentan siempre como "a crear" salvo que ya exista una unidad/tema/actividad
  // con el mismo título bajo la misma materia/tema, lo cual solo puede saberse
  // recorriendo lo ya existente por título normalizado igual que arriba.
  const existingUnits = await curriculumUnitsRepo.list();
  const existingUnitTitles = new Set(existingUnits.map((u) => `${u.subject_id}::${normalizeTitle(u.title)}`));
  for (const u of data.units) {
    const subject = subjectsByTitle.get(normalizeTitle(data.subjects.find((s) => s.code === u.subjectCode)?.title ?? ""));
    const key = subject ? `${subject.id}::${normalizeTitle(u.title)}` : null;
    items.push({ kind: "unit", label: u.title, action: key && existingUnitTitles.has(key) ? "sin_cambios" : "crear" });
  }

  const existingTopics = await topicsRepo.list({ where: "archived_at IS NULL" });
  const existingTopicTitles = new Set(existingTopics.map((t) => `${t.subject_id}::${normalizeTitle(t.title)}`));
  for (const t of data.topics) {
    const subject = subjectsByTitle.get(normalizeTitle(data.subjects.find((s) => s.code === t.subjectCode)?.title ?? ""));
    const key = subject ? `${subject.id}::${normalizeTitle(t.title)}` : null;
    items.push({ kind: "topic", label: t.title, action: key && existingTopicTitles.has(key) ? "sin_cambios" : "crear" });
  }

  const existingActivities = await curriculumActivitiesRepo.list();
  const existingActivityKeys = new Set(existingActivities.map((a) => `${a.topic_id}::${normalizeTitle(a.title)}`));
  for (const a of data.activities) {
    const topicDef = data.topics.find((t) => t.code === a.topicCode);
    const subject = topicDef
      ? subjectsByTitle.get(normalizeTitle(data.subjects.find((s) => s.code === topicDef.subjectCode)?.title ?? ""))
      : undefined;
    const topic = subject ? existingTopics.find((t) => t.subject_id === subject.id && normalizeTitle(t.title) === normalizeTitle(topicDef!.title)) : undefined;
    const key = topic ? `${topic.id}::${normalizeTitle(a.title)}` : null;
    items.push({ kind: "activity", label: a.title, action: key && existingActivityKeys.has(key) ? "sin_cambios" : "crear" });
  }

  return {
    items,
    toCreate: items.filter((i) => i.action === "crear").length,
    toUpdate: items.filter((i) => i.action === "actualizar").length,
    unchanged: items.filter((i) => i.action === "sin_cambios").length,
  };
}

// --- 3. Escritura idempotente: solo después de confirmar la previsualización ---

export interface CurriculumImportResult {
  careerId: string;
  stagesCreated: number;
  subjectsCreated: number;
  subjectsUpdated: number;
  subjectsSkipped: string[];
  unitsCreated: number;
  topicsCreated: number;
  activitiesCreated: number;
  creditsRecalculated: number;
}

export async function applyCurriculumImport(
  data: CurriculumImportData,
  sourceDocumentPath: string | null = null,
  /** Se estampa solo en materias/temas efectivamente CREADOS en esta corrida — los que ya existían no se tocan. */
  curriculumVersionId: string | null = null,
): Promise<CurriculumImportResult> {
  const result: CurriculumImportResult = {
    careerId: "",
    stagesCreated: 0,
    subjectsCreated: 0,
    subjectsUpdated: 0,
    subjectsSkipped: [],
    unitsCreated: 0,
    topicsCreated: 0,
    activitiesCreated: 0,
    creditsRecalculated: 0,
  };

  // Career: una fila por (título, versión) — reimportar el mismo documento no duplica.
  const careersByKey = await existingCareerByTitleVersion();
  const careerKey = `${normalizeTitle(data.career.title)}::${data.career.versionLabel}`;
  let career = careersByKey.get(careerKey);
  if (!career) {
    career = {
      id: crypto.randomUUID(),
      title: data.career.title,
      version_label: data.career.versionLabel,
      source_document_path: sourceDocumentPath,
      imported_at: now(),
      total_xp_budget: data.career.totalXpBudget,
      status: "activa",
      sort_order: 0,
      notes: null,
      tags: "importado",
      created_at: now(),
      updated_at: now(),
      archived_at: null,
    };
    await careersRepo.insert(career);
  }
  result.careerId = career.id;

  // Etapas: por título normalizado.
  const stagesByTitle = await existingStageByTitle();
  const stageIdByCode = new Map<string, string>();
  for (const s of data.stages) {
    const key = normalizeTitle(s.title);
    let stage = stagesByTitle.get(key);
    if (!stage) {
      stage = {
        id: crypto.randomUUID(),
        code: s.code,
        title: s.title,
        description: s.description,
        orientative_duration: s.orientativeDuration,
        main_product: s.mainProduct,
        sort_order: s.sortOrder,
        status: "activa",
        notes: null,
        tags: "importado",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      };
      await learningStagesRepo.insert(stage);
      stagesByTitle.set(key, stage);
      result.stagesCreated++;
    }
    stageIdByCode.set(s.code, stage.id);
  }

  // Materias: por título normalizado — nunca se duplica una materia ya existente,
  // solo se le asigna carrera/etapa si todavía no las tenía.
  const fundamentalQuestions = await fundamentalQuestionsRepo.list();
  const fqIdByCode = new Map(fundamentalQuestions.map((fq) => [fq.code, fq.id]));

  const subjectsByTitle = await existingSubjectByTitle();
  const subjectIdByCode = new Map<string, string>();
  for (const s of data.subjects) {
    const key = normalizeTitle(s.title);
    const existing = subjectsByTitle.get(key);
    const stageId = s.stageCode ? (stageIdByCode.get(s.stageCode) ?? null) : null;
    if (!existing) {
      // fundamental_question_id es NOT NULL en el esquema (Fase C la reutiliza
      // tal cual, sin crear preguntas fundamentales nuevas) — si el documento
      // no referencia una FQ existente por código, la materia no puede
      // insertarse a ciegas: se reporta como omitida en vez de inventar un valor.
      const fqId = s.fundamentalQuestionCode ? fqIdByCode.get(s.fundamentalQuestionCode) : undefined;
      if (!fqId) {
        result.subjectsSkipped.push(
          `${s.title} (${s.code}): fundamentalQuestionCode "${s.fundamentalQuestionCode ?? "—"}" no resuelve contra ninguna pregunta fundamental existente.`,
        );
        continue;
      }
      const row: SubjectRow = {
        id: crypto.randomUUID(),
        fundamental_question_id: fqId,
        title: s.title,
        description: s.description,
        credits: s.credits,
        complexity: 3,
        importance: 3,
        estimated_load: 3,
        is_mandatory: 1,
        budgeted_xp: null,
        completed_at: null,
        completion_budgeted_xp: null,
        learning_stage_id: stageId,
        career_id: career.id,
        status: "activa",
        sort_order: 0,
        notes: null,
        tags: "importado",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
        curriculum_version_id: curriculumVersionId,
      };
      await subjectsRepo.insert(row);
      subjectsByTitle.set(key, row);
      subjectIdByCode.set(s.code, row.id);
      result.subjectsCreated++;
    } else {
      subjectIdByCode.set(s.code, existing.id);
      const patch: Partial<SubjectRow> = {};
      if (!existing.career_id) patch.career_id = career.id;
      if (!existing.learning_stage_id && stageId) patch.learning_stage_id = stageId;
      if (Object.keys(patch).length > 0) {
        await subjectsRepo.update(existing.id, patch);
        result.subjectsUpdated++;
      }
    }
  }

  // Unidades: por (materia, título normalizado).
  const existingUnits = await curriculumUnitsRepo.list();
  const unitByKey = new Map<string, CurriculumUnitRow>(existingUnits.map((u) => [`${u.subject_id}::${normalizeTitle(u.title)}`, u]));
  const unitIdByCode = new Map<string, string>();
  for (const u of data.units) {
    const subjectId = subjectIdByCode.get(u.subjectCode);
    if (!subjectId) continue;
    const key = `${subjectId}::${normalizeTitle(u.title)}`;
    let unit = unitByKey.get(key);
    if (!unit) {
      unit = {
        id: crypto.randomUUID(),
        subject_id: subjectId,
        title: u.title,
        description: u.description,
        budgeted_xp: u.budgetedXp,
        status: "activa",
        sort_order: 0,
        notes: null,
        tags: "importado",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
      };
      await curriculumUnitsRepo.insert(unit);
      unitByKey.set(key, unit);
      result.unitsCreated++;
    }
    unitIdByCode.set(u.code, unit.id);
  }

  // Temas: por (materia, título normalizado).
  const existingTopics = await topicsRepo.list({ where: "archived_at IS NULL" });
  const topicByKey = new Map<string, TopicRow>(existingTopics.map((t) => [`${t.subject_id}::${normalizeTitle(t.title)}`, t]));
  const topicIdByCode = new Map<string, string>();
  let topicAutoIndex = 0;
  for (const t of data.topics) {
    const subjectId = subjectIdByCode.get(t.subjectCode);
    if (!subjectId) continue;
    const key = `${subjectId}::${normalizeTitle(t.title)}`;
    const unitId = t.unitCode ? (unitIdByCode.get(t.unitCode) ?? null) : null;
    let topic = topicByKey.get(key);
    if (!topic) {
      topic = {
        id: crypto.randomUUID(),
        subject_id: subjectId,
        competency_id: null,
        learning_stage_id: null,
        curriculum_unit_id: unitId,
        title: t.title,
        description: t.description,
        completed_at: null,
        status: "activo",
        sort_order: 0,
        notes: null,
        tags: "importado",
        created_at: now(),
        updated_at: now(),
        archived_at: null,
        curriculum_version_id: curriculumVersionId,
      };
      await topicsRepo.insert(topic);
      topicByKey.set(key, topic);
      result.topicsCreated++;
    } else if (!topic.curriculum_unit_id && unitId) {
      await topicsRepo.update(topic.id, { curriculum_unit_id: unitId });
    }
    topicIdByCode.set(t.code ?? `__auto_topic_${topicAutoIndex++}`, topic.id);
  }

  // Actividades: siempre nuevas si no existe una con el mismo (tema, título).
  const existingActivities = await curriculumActivitiesRepo.list();
  const activityKeys = new Set(existingActivities.map((a) => `${a.topic_id}::${normalizeTitle(a.title)}`));
  for (const a of data.activities) {
    const topicId = topicIdByCode.get(a.topicCode);
    if (!topicId) continue;
    const key = `${topicId}::${normalizeTitle(a.title)}`;
    if (activityKeys.has(key)) continue;
    const row: CurriculumActivityRow = {
      id: crypto.randomUUID(),
      topic_id: topicId,
      title: a.title,
      activity_type: a.activityType,
      estimated_minutes: a.estimatedMinutes,
      scheduled_date: a.scheduledDate,
      completed_at: null,
      status: "activa",
      sort_order: 0,
      notes: null,
      tags: "importado",
      created_at: now(),
      updated_at: now(),
      archived_at: null,
    };
    await curriculumActivitiesRepo.insert(row);
    activityKeys.add(key);
    result.activitiesCreated++;
  }

  // Los créditos (1-5) se normalizan por cantidad de temas de cada materia —
  // si esta corrida creó temas nuevos en materias existentes, sus créditos
  // podrían haber quedado desactualizados. Recalcular sobre TODAS las
  // materias activas mantiene el reparto de XP por materia consistente.
  result.creditsRecalculated = await recalculateSubjectCredits();

  return result;
}
