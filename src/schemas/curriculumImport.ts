import { z } from "zod";

/**
 * Esquema intermedio común para el importador de currículo (Fase D). JSON,
 * CSV y Markdown/PDF se normalizan todos a esta misma forma antes de
 * previsualizar o escribir — así el escritor (`services/curriculumImport.ts`)
 * no necesita conocer el formato de origen. Sigue la convención ya usada por
 * `services/seedImport.ts`: las entidades se referencian entre sí por
 * `*_code` (no por ID embebido), resueltas contra la base o entre ellas
 * mismas durante la importación.
 */
export const careerImportSchema = z.object({
  title: z.string().min(1),
  versionLabel: z.string().min(1),
  totalXpBudget: z.number().min(0).nullable().default(null),
});

export const stageImportSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  orientativeDuration: z.string().nullable().default(null),
  mainProduct: z.string().nullable().default(null),
  sortOrder: z.number().default(0),
});

export const subjectImportSchema = z.object({
  code: z.string().min(1),
  stageCode: z.string().nullable().default(null),
  // Referencia una pregunta fundamental YA EXISTENTE por su `code` — este
  // importador nunca crea preguntas fundamentales nuevas (son el eje
  // reutilizado por sesiones/proyectos/bibliografía/XP, ver Fase C). Si no
  // se especifica o no resuelve contra la base, la materia no puede
  // insertarse (fundamental_question_id es NOT NULL) y se reporta como error.
  fundamentalQuestionCode: z.string().nullable().default(null),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  credits: z.number().min(1).max(5).default(3),
});

export const unitImportSchema = z.object({
  code: z.string().min(1),
  subjectCode: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  budgetedXp: z.number().min(0).nullable().default(null),
});

export const topicImportSchema = z.object({
  code: z.string().nullable().default(null),
  subjectCode: z.string().min(1),
  unitCode: z.string().nullable().default(null),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
});

export const activityImportSchema = z.object({
  topicCode: z.string().min(1),
  title: z.string().min(1),
  activityType: z.string().default("estudio"),
  estimatedMinutes: z.number().min(0).nullable().default(null),
  scheduledDate: z.string().nullable().default(null),
});

export const curriculumImportSchema = z
  .object({
    career: careerImportSchema,
    stages: z.array(stageImportSchema).default([]),
    subjects: z.array(subjectImportSchema).min(1, "El currículo debe incluir al menos una materia."),
    units: z.array(unitImportSchema).default([]),
    topics: z.array(topicImportSchema).default([]),
    activities: z.array(activityImportSchema).default([]),
  })
  .strict();

export type CurriculumImportData = z.infer<typeof curriculumImportSchema>;

export interface CurriculumImportValidationResult {
  valid: boolean;
  data: CurriculumImportData | null;
  errors: string[];
}

/**
 * Valida contra el esquema y, además, la coherencia entre `*_code` que Zod
 * solo no puede expresar: toda unidad/tema debe referenciar una materia que
 * exista en el mismo documento, toda actividad debe referenciar un tema que
 * exista, y no puede haber `code` duplicado dentro de una misma lista.
 */
export function validateCurriculumImport(raw: unknown): CurriculumImportValidationResult {
  const parsed = curriculumImportSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      data: null,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`),
    };
  }

  const data = parsed.data;
  const errors: string[] = [];

  const subjectCodes = new Set(data.subjects.map((s) => s.code));
  const stageCodes = new Set(data.stages.map((s) => s.code));
  const unitCodes = new Set(data.units.map((u) => u.code));
  const topicCodes = new Set(data.topics.map((t) => t.code).filter((c): c is string => c != null));

  checkDuplicates(data.stages.map((s) => s.code), "stages", errors);
  checkDuplicates(data.subjects.map((s) => s.code), "subjects", errors);
  checkDuplicates(data.units.map((u) => u.code), "units", errors);

  for (const s of data.subjects) {
    if (s.stageCode && !stageCodes.has(s.stageCode)) {
      errors.push(`La materia "${s.code}" referencia la etapa "${s.stageCode}", que no existe en el documento.`);
    }
  }
  for (const u of data.units) {
    if (!subjectCodes.has(u.subjectCode)) {
      errors.push(`La unidad "${u.code}" referencia la materia "${u.subjectCode}", que no existe en el documento.`);
    }
  }
  for (const t of data.topics) {
    if (!subjectCodes.has(t.subjectCode)) {
      errors.push(`Un tema referencia la materia "${t.subjectCode}", que no existe en el documento.`);
    }
    if (t.unitCode && !unitCodes.has(t.unitCode)) {
      errors.push(`Un tema referencia la unidad "${t.unitCode}", que no existe en el documento.`);
    }
  }
  for (const a of data.activities) {
    if (!topicCodes.has(a.topicCode)) {
      errors.push(`La actividad "${a.title}" referencia el tema "${a.topicCode}", que no tiene código en el documento.`);
    }
  }

  return { valid: errors.length === 0, data, errors };
}

function checkDuplicates(codes: string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) {
      errors.push(`Código de ${label} duplicado en el documento: "${code}".`);
    }
    seen.add(code);
  }
}
