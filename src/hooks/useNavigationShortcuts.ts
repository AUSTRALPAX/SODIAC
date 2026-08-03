import { useEffect } from "react";
import type { AppHistory } from "./useAppHistory";

/**
 * Alt+← / Alt+→ y los botones laterales del mouse (3/4), como en un navegador.
 *
 * `preventDefault()` es necesario: WebView2 mapea Alt+← a su propio "atrás"
 * nativo, y sin esto la navegación se dispararía dos veces.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useNavigationShortcuts({ goBack, goForward }: Pick<AppHistory, "goBack" | "goForward">): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // No robarle la combinación a un campo de texto que la esté usando.
      if (isEditableTarget(e.target)) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [goBack, goForward]);
}
