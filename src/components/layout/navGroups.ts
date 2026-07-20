import { NAV_ITEMS, type NavItem } from "./navigation";

function itemsByPath(paths: string[]): NavItem[] {
  return paths.map((path) => NAV_ITEMS.find((item) => item.path === path)).filter((item): item is NavItem => !!item);
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Agrupación visual de la barra lateral por fase de flujo de trabajo
 * (Fase 4 de la mejora integral) — mismos 13 destinos de `NAV_ITEMS`,
 * sin agregar ni quitar ninguno, solo organizados bajo encabezados.
 */
export const NAV_GROUPS: NavGroup[] = [
  { label: "Inicio", items: itemsByPath(["/dashboard", "/trajectory"]) },
  { label: "Estudio", items: itemsByPath(["/carrera", "/sesiones", "/planificacion", "/repasos"]) },
  { label: "Producción", items: itemsByPath(["/proyectos", "/documentos"]) },
  { label: "Conocimiento", items: itemsByPath(["/biblioteca", "/obsidian", "/mapa"]) },
  { label: "Análisis", items: itemsByPath(["/estadisticas"]) },
  { label: "Sistema", items: itemsByPath(["/configuracion"]) },
];
