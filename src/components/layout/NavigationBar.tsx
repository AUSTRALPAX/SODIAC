import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAppHistory } from "@/hooks/useAppHistory";
import { useNavigationShortcuts } from "@/hooks/useNavigationShortcuts";
import { useScrollRestore } from "@/hooks/useScrollRestore";

/**
 * Navegación histórica dentro de SODIAC — equivalente a los botones de un
 * navegador, pero limitada a las rutas internas de la app: nunca sale a una
 * página externa ni cierra la ventana (ver el fallback en `useAppHistory`).
 *
 * No confundir con los breadcrumbs: estos suben por la jerarquía (Carrera →
 * materia → tema), los botones recorren el orden real en que se visitó.
 */
export function NavigationBar() {
  const history = useAppHistory();
  useNavigationShortcuts(history);
  useScrollRestore();

  const buttonClass =
    "rounded p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary " +
    "disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-secondary";

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border-subtle px-3">
      <button
        type="button"
        onClick={history.goBack}
        disabled={!history.canGoBack}
        title="Volver (Alt+←)"
        aria-label="Volver"
        className={buttonClass}
      >
        <ArrowLeft size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={history.goForward}
        disabled={!history.canGoForward}
        title="Avanzar (Alt+→)"
        aria-label="Avanzar"
        className={buttonClass}
      >
        <ArrowRight size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}
