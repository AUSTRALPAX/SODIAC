import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  BookOpen,
  ClipboardList,
  RotateCcw,
  FolderKanban,
  Library,
  BarChart3,
  FileText,
  Network,
  Settings,
  Home,
  Trophy,
  GraduationCap,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: Home },
  { label: "Trayectoria", path: "/trajectory", icon: Trophy },
  { label: "Carrera", path: "/carrera", icon: GraduationCap },
  { label: "Mapa", path: "/mapa", icon: Network },
  { label: "Sesiones", path: "/sesiones", icon: BookOpen },
  { label: "Planificación", path: "/planificacion", icon: Calendar },
  { label: "Repasos", path: "/repasos", icon: RotateCcw },
  { label: "Proyectos", path: "/proyectos", icon: FolderKanban },
  { label: "Biblioteca", path: "/biblioteca", icon: Library },
  { label: "Estadísticas", path: "/estadisticas", icon: BarChart3 },
  { label: "Documentos", path: "/documentos", icon: FileText },
  { label: "Obsidian", path: "/obsidian", icon: ClipboardList },
  { label: "Configuración", path: "/configuracion", icon: Settings },
];
