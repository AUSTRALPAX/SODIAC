import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

/**
 * React Router no expone si hay historial hacia atrás o hacia adelante, así que
 * el estado de los botones se deriva del índice que el propio router mantiene en
 * `history.state.idx` (ver `getHistoryState` en react-router: guarda
 * `{ usr, key, idx }` en cada entrada). `idx` es la posición actual dentro de la
 * pila de sesión del navegador.
 *
 * - `canGoBack`: hay una entrada anterior si el índice no es el primero.
 * - `canGoForward`: se compara contra el índice máximo alcanzado. Un PUSH
 *   destruye las entradas hacia adelante, así que ahí el máximo se trunca.
 */
function readIdx(): number {
  const state = window.history.state as { idx?: number | null } | null;
  return typeof state?.idx === "number" ? state.idx : 0;
}

export interface AppHistory {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

/**
 * Si no hay historial previo (la app se abrió directamente en una ruta profunda),
 * el botón Atrás nunca llama a `navigate(-1)` — eso saldría de la aplicación.
 * En su lugar sube a la entidad padre y, si no hay, al Dashboard.
 */
export function parentPathFor(pathname: string): string {
  if (/^\/carrera\/[^/]+/.test(pathname)) return "/carrera";
  if (/^\/sesiones\/[^/]+/.test(pathname)) return "/sesiones";
  return "/dashboard";
}

/**
 * Índice máximo alcanzado tras una navegación. Un PUSH descarta las entradas
 * hacia adelante, así que el techo pasa a ser la entrada nueva; POP y REPLACE
 * se mueven dentro del historial existente sin recortarlo.
 */
export function nextMaxIndex(previousMax: number, currentIdx: number, type: "PUSH" | "POP" | "REPLACE"): number {
  return type === "PUSH" ? currentIdx : Math.max(previousMax, currentIdx);
}

export function useAppHistory(): AppHistory {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  const [idx, setIdx] = useState(readIdx);
  const maxIdxRef = useRef(idx);
  const [maxIdx, setMaxIdx] = useState(idx);

  useEffect(() => {
    const current = readIdx();
    setIdx(current);

    const nextMax = nextMaxIndex(maxIdxRef.current, current, navigationType);
    maxIdxRef.current = nextMax;
    setMaxIdx(nextMax);
  }, [location.key, navigationType]);

  const canGoBack = idx > 0;
  const canGoForward = idx < maxIdx;

  const goBack = useCallback(() => {
    if (canGoBack) {
      navigate(-1);
      return;
    }
    navigate(parentPathFor(location.pathname), { replace: true });
  }, [canGoBack, navigate, location.pathname]);

  const goForward = useCallback(() => {
    if (canGoForward) navigate(1);
  }, [canGoForward, navigate]);

  return { canGoBack, canGoForward, goBack, goForward };
}
