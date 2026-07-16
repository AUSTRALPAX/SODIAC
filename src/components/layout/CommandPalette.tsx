import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./navigation";

/** Paleta global Ctrl+K (docs/PRODUCT_SPEC.md — navegación). */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-32"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <Command
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
      >
        <Command.Input
          autoFocus
          placeholder="Buscar sección, tema, nota…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
            Sin resultados.
          </Command.Empty>
          {NAV_ITEMS.map((item) => (
            <Command.Item
              key={item.path}
              onSelect={() => {
                navigate(item.path);
                setOpen(false);
              }}
              className="cursor-pointer rounded px-3 py-2 text-sm text-text-secondary data-[selected=true]:bg-surface-hover data-[selected=true]:text-text-primary"
            >
              {item.label}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
