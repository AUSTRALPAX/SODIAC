import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { TodayPage } from "@/features/today/TodayPage";
import { CurriculumPage } from "@/features/curriculum/CurriculumPage";
import { SessionsPage } from "@/features/sessions/SessionsPage";
import { PlanningPage } from "@/features/planning/PlanningPage";
import { ReviewsPage } from "@/features/reviews/ReviewsPage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { LibraryPage } from "@/features/library/LibraryPage";
import { StatisticsPage } from "@/features/statistics/StatisticsPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { ObsidianPage } from "@/features/obsidian/ObsidianPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: "mapa", element: <CurriculumPage /> },
      { path: "sesiones", element: <SessionsPage /> },
      { path: "planificacion", element: <PlanningPage /> },
      { path: "repasos", element: <ReviewsPage /> },
      { path: "proyectos", element: <ProjectsPage /> },
      { path: "biblioteca", element: <LibraryPage /> },
      { path: "estadisticas", element: <StatisticsPage /> },
      { path: "documentos", element: <DocumentsPage /> },
      { path: "obsidian", element: <ObsidianPage /> },
      { path: "configuracion", element: <SettingsPage /> },
    ],
  },
]);
