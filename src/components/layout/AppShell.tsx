import { NavLink, Outlet } from "react-router-dom";
import { SodiacLogo } from "@/components/brand/SodiacLogo";
import { NAV_GROUPS } from "./navGroups";
import { CommandPalette } from "./CommandPalette";
import { SidebarSectionLabel } from "./SidebarSectionLabel";
import { SessionRecoveryBanner } from "@/features/sessions/SessionRecoveryBanner";

/** Espaciado del contenedor de cada grupo de nav — el primero necesita su
 * propio padding-top (no hay un grupo anterior ni borde que lo empuje);
 * los siguientes se separan del anterior con un margen + línea divisoria.
 * Antes el primer grupo no tenía ninguna de estas dos clases ("" vacío),
 * por eso "INICIO" quedaba pegado al borde superior a diferencia de
 * "ESTUDIO" y el resto. */
const FIRST_GROUP_CLASSES = "pt-4";
const OTHER_GROUP_CLASSES = "mt-3 border-t border-border-subtle pt-3";

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-text-primary">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-background-deep">
        <div className="flex h-[72px] shrink-0 items-center justify-center gap-3 border-b border-border-subtle px-4 text-text-primary">
          <SodiacLogo variant="symbol" size={30} decorative />
          <span
            className="font-display font-semibold uppercase leading-none text-text-primary"
            style={{ fontSize: "14px", letterSpacing: "0.2em" }}
          >
            SODIAC
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.label} className={index === 0 ? FIRST_GROUP_CLASSES : OTHER_GROUP_CLASSES}>
              <SidebarSectionLabel>{group.label}</SidebarSectionLabel>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "bg-surface-elevated text-text-primary"
                          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`
                    }
                  >
                    <item.icon size={16} strokeWidth={1.75} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border-subtle px-3 py-3 text-xs text-text-muted">
          Ctrl+K para buscar
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <SessionRecoveryBanner />
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
