import { z } from "zod";

/**
 * Un schema `.strict()` por sección — mismo estilo que
 * `curriculumImport.ts`/`evaluationResponse.ts`. Cada uno lleva su propio
 * `schemaVersion` literal: si el valor guardado no matchea (versión vieja o
 * forma inválida), `loadViewPreference` descarta el valor y usa los
 * predeterminados en vez de romper la pantalla — ver `services/viewPreferences.ts`.
 *
 * Solo van acá los campos que son "cómo el usuario dejó organizada la
 * vista" (orden, filtros, pestaña activa, panel expandido). Nunca: diálogos
 * de confirmación, formularios en progreso, tokens, ni datos académicos.
 */

export const libraryViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    sortKey: z.enum(["titulo", "area", "autor", "reciente", "estado"]).default("area"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
    typeFilter: z.string().default(""),
    stateFilter: z.string().default(""),
    areaFilter: z.string().default(""),
    categoryFilter: z.string().default(""),
    functionFilter: z.string().default(""),
    availabilityFilter: z.enum(["", "disponible", "sin_archivo"]).default(""),
    subjectFilter: z.string().default(""),
    topicFilter: z.string().default(""),
    showMinimalPathOnly: z.boolean().default(false),
    expandedId: z.string().nullable().default(null),
  })
  .strict();
export type LibraryViewPreference = z.infer<typeof libraryViewPreferenceSchema>;
export const LIBRARY_VIEW_DEFAULTS: LibraryViewPreference = libraryViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const trajectoryViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    tab: z.string().default("resumen"),
  })
  .strict();
export type TrajectoryViewPreference = z.infer<typeof trajectoryViewPreferenceSchema>;
export const TRAJECTORY_VIEW_DEFAULTS: TrajectoryViewPreference = trajectoryViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const careerViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    view: z.string().default("recorrido"),
    cronogramaRange: z.enum(["semana", "mes", "todo"]).default("todo"),
  })
  .strict();
export type CareerViewPreference = z.infer<typeof careerViewPreferenceSchema>;
export const CAREER_VIEW_DEFAULTS: CareerViewPreference = careerViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const masterScheduleViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    view: z.enum(["linea", "materias"]).default("linea"),
    density: z.enum(["compacto", "detallado"]).default("detallado"),
    search: z.string().default(""),
    expandedTopicId: z.string().nullable().default(null),
    collapsedSubjectIds: z.array(z.string()).default([]),
  })
  .strict();
export type MasterScheduleViewPreference = z.infer<typeof masterScheduleViewPreferenceSchema>;
export const MASTER_SCHEDULE_VIEW_DEFAULTS: MasterScheduleViewPreference = masterScheduleViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const mapViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    view: z.enum(["arbol", "tabla", "mapa"]).default("arbol"),
    hiddenTypes: z.array(z.string()).default(["obsidian_note"]),
    expandedSubjectIds: z.array(z.string()).default([]),
    showNotes: z.boolean().default(false),
    focusSubjectId: z.string().nullable().default(null),
    showLegend: z.boolean().default(true),
    showCompleteness: z.boolean().default(true),
  })
  .strict();
export type MapViewPreference = z.infer<typeof mapViewPreferenceSchema>;
export const MAP_VIEW_DEFAULTS: MapViewPreference = mapViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const sessionsViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    view: z.string().default("proxima"),
  })
  .strict();
export type SessionsViewPreference = z.infer<typeof sessionsViewPreferenceSchema>;
export const SESSIONS_VIEW_DEFAULTS: SessionsViewPreference = sessionsViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const reviewsViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    showHistory: z.boolean().default(false),
  })
  .strict();
export type ReviewsViewPreference = z.infer<typeof reviewsViewPreferenceSchema>;
export const REVIEWS_VIEW_DEFAULTS: ReviewsViewPreference = reviewsViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const obsidianViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    search: z.string().default(""),
  })
  .strict();
export type ObsidianViewPreference = z.infer<typeof obsidianViewPreferenceSchema>;
export const OBSIDIAN_VIEW_DEFAULTS: ObsidianViewPreference = obsidianViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const projectsViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedId: z.string().nullable().default(null),
  })
  .strict();
export type ProjectsViewPreference = z.infer<typeof projectsViewPreferenceSchema>;
export const PROJECTS_VIEW_DEFAULTS: ProjectsViewPreference = projectsViewPreferenceSchema.parse({
  schemaVersion: 1,
});

export const documentsViewPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedId: z.string().nullable().default(null),
  })
  .strict();
export type DocumentsViewPreference = z.infer<typeof documentsViewPreferenceSchema>;
export const DOCUMENTS_VIEW_DEFAULTS: DocumentsViewPreference = documentsViewPreferenceSchema.parse({
  schemaVersion: 1,
});
