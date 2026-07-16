/**
 * Paleta por tipo de entidad para el Mapa (pedido explícito del usuario,
 * sección 16 de la actualización "XP directo / Carrera / rediseño del
 * Mapa"). Los colores se usan en borde/indicador/encabezado — nunca como
 * relleno saturado completo del nodo (fondo oscuro + texto blanco).
 */
export type MapEntityType =
  | "fundamental_question"
  | "competency"
  | "subject"
  | "curriculum_unit"
  | "topic"
  | "obsidian_note"
  | "resource"
  | "project";

export const TYPE_COLOR: Record<MapEntityType, string> = {
  fundamental_question: "#00D6C5",
  competency: "#4F7CFF",
  subject: "#8B5CF6",
  curriculum_unit: "#B05AE8",
  topic: "#E6B85C",
  obsidian_note: "#43D69A",
  resource: "#7E8A96",
  project: "#FF6B72",
};

export const TYPE_LABEL: Record<MapEntityType, string> = {
  fundamental_question: "Pregunta fundamental",
  competency: "Competencia",
  subject: "Materia",
  curriculum_unit: "Unidad",
  topic: "Tema",
  obsidian_note: "Nota de Obsidian",
  resource: "Bibliografía",
  project: "Proyecto",
};

/**
 * Tipos efectivamente renderizados como nodos en esta versión del Mapa.
 * `obsidian_note` y `resource` quedan en la paleta (por si se agregan más
 * adelante) pero no se dibujan todavía — requerirían resolver la unión
 * `bibliographic_source` completa, fuera del alcance de este rediseño
 * (que se centró en corregir conectores/layout/colores, no en sumar
 * relaciones nuevas). Decisión de alcance explícita, no una omisión oculta.
 */
export const RENDERED_TYPES: MapEntityType[] = [
  "fundamental_question",
  "competency",
  "subject",
  "curriculum_unit",
  "topic",
  "project",
];
