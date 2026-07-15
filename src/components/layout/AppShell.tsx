import { NavLink, Outlet } from "react-router-dom";
import { SodiacLogo } from "@/components/brand/SodiacLogo";
import { NAV_ITEMS } from "./navigation";
import { CommandPalette } from "./CommandPalette";

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-text-primary">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-background-deep">
        <div className="px-5 py-5 text-text-primary">
          <SodiacLogo variant="horizontal" size={22} />
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => (
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
        </nav>
        <div className="border-t border-border-subtle px-3 py-3 text-xs text-text-muted">
          Ctrl+K para buscar
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
