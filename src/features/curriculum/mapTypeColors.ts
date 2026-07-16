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
  curriculum_unit: "#C05ADB",
  topic: "#E6B85C",
  obsidian_note: "#43D69A",
  resource: "#8493A1",
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
 * Tipos que siempre pueden aparecer como nodo (jerarquía académica —
 * preguntas/competencias/materias/unidades/temas/proyectos). `obsidian_note`
 * ya tiene datos reales (495 notas vinculadas por sodiac_id tras la Fase J)
 * y se agrega como capa opcional, activable con "Mostrar notas" (ver
 * RelationsView.tsx) — no por defecto, para no duplicar el tamaño del grafo.
 * `resource` queda en la paleta pero sin renderizar todavía: solo existe 1
 * vínculo real en `bibliographic_source` (40 recursos, en su mayoría sin
 * conectar a ninguna entidad académica) — no hay suficiente dato real para
 * que valga la pena como capa, a diferencia de las notas.
 */
export const RENDERED_TYPES: MapEntityType[] = [
  "fundamental_question",
  "competency",
  "subject",
  "curriculum_unit",
  "topic",
  "project",
];

export const OPTIONAL_RENDERED_TYPES: MapEntityType[] = ["obsidian_note"];
