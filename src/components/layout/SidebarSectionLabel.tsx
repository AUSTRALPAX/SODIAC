import type { ReactNode } from "react";

/** Estilo único para los encabezados de grupo de la barra lateral (INICIO,
 * ESTUDIO, PRODUCCIÓN, CONOCIMIENTO, ANÁLISIS, SISTEMA) — nunca debe haber
 * un className distinto por encabezado; el espaciado antes de cada uno lo
 * define el contenedor del grupo en AppShell.tsx, no este componente. */
export function SidebarSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </p>
  );
}
