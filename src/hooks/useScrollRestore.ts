import { useEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Posición de scroll por entrada de historial.
 *
 * Deliberadamente en memoria y NO en `useViewPreference`: cada guardado de
 * preferencias son 3 sentencias SQL, una de ellas un INSERT permanente en
 * `activity_log` con el blob completo. Persistir scroll ahí haría crecer esa
 * tabla en cada pausa de scroll y engordaría todos los backups. El pedido solo
 * exige restaurar el scroll al volver dentro de la misma ejecución.
 */
const scrollByLocationKey = new Map<string, number>();

/**
 * Cuánto esperar a que el contenido asíncrono levante la altura. Medido contra
 * la app real: Carrera tiene altura recién a los ~400 ms, así que 2 s da margen
 * de sobra sin dejar el intervalo colgado. Se cancela al navegar y también en
 * cuanto el usuario scrollea por su cuenta.
 */
const RESTORE_ATTEMPTS = 40;
const RESTORE_INTERVAL_MS = 50;

/**
 * @param containerRef contenedor con `overflow-y-auto`. Si se omite se usa el
 * scroller principal del shell (`#sodiac-scroll`), que es el que scrollea en la
 * mayoría de las secciones.
 * @param scopeId distingue scrollers que coexisten en la misma entrada de
 * historial — cuatro páginas (Dashboard, Proyectos, Documentos, Planificación)
 * traen su propio contenedor con overflow además del scroller del shell.
 */
export function useScrollRestore(containerRef?: RefObject<HTMLElement | null>, scopeId = "main"): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const storageKey = `${location.key}::${scopeId}`;
  const keyRef = useRef(storageKey);

  useEffect(() => {
    const el = containerRef?.current ?? document.getElementById("sodiac-scroll");
    if (!el) return;

    keyRef.current = storageKey;

    // NO se guarda `el.scrollTop` acá. Para cuando corre este efecto React ya
    // montó la ruta nueva, el contenedor se encogió y el navegador clampeó
    // scrollTop a 0: guardarlo pisaría con un cero la posición real de la
    // página que estamos dejando. Ese cero era exactamente el bug medido en
    // v1.18.0. La posición buena ya la dejó el listener de scroll de abajo,
    // mientras la página anterior seguía montada.

    let cancelled = false;

    if (navigationType === "POP") {
      // Volver/avanzar: recuperar la posición esperando a que el contenido
      // cargue (las páginas arrancan con altura casi nula mientras resuelven
      // sus consultas, y ahí un scrollTop se descarta solo).
      const target = scrollByLocationKey.get(storageKey) ?? 0;
      if (target > 0) {
        let attempts = 0;
        const timer = setInterval(() => {
          if (cancelled) return;
          attempts += 1;
          if (el.scrollHeight - el.clientHeight >= target) {
            el.scrollTop = target;
            clearInterval(timer);
          } else if (attempts >= RESTORE_ATTEMPTS) {
            clearInterval(timer);
          }
        }, RESTORE_INTERVAL_MS);

        // Si el usuario scrollea antes de que termine de cargar, gana él: sería
        // muy molesto que la página le salte bajo el dedo un segundo después.
        const abortRestore = () => {
          cancelled = true;
          clearInterval(timer);
        };
        el.addEventListener("wheel", abortRestore, { passive: true, once: true });
        el.addEventListener("touchstart", abortRestore, { passive: true, once: true });

        return () => {
          abortRestore();
          el.removeEventListener("wheel", abortRestore);
          el.removeEventListener("touchstart", abortRestore);
        };
      }
      el.scrollTop = 0;
      return;
    }

    // Destino nuevo: arrancar arriba. Hasta ahora el scroll no se reseteaba
    // nunca al navegar (el contenedor no se desmonta), así que una sección
    // corta podía abrirse "scrolleada" por la anterior.
    el.scrollTop = 0;
  }, [storageKey, navigationType, containerRef]);

  // Única fuente de verdad del guardado: se anota mientras la página está
  // montada, que es el momento en que el valor todavía es válido.
  useEffect(() => {
    const el = containerRef?.current ?? document.getElementById("sodiac-scroll");
    if (!el) return;

    function onScroll() {
      // Al cambiar de ruta el contenedor colapsa y el navegador dispara un
      // scroll con scrollTop = 0 que no es del usuario. Se ignora: sobre un
      // contenedor sin nada que scrollear no hay posición que valga la pena
      // recordar, y dejarlo pasar pisaría la de la página anterior.
      if (el!.scrollHeight - el!.clientHeight === 0) return;
      // Sin debounce: un Map.set es más barato que el timer que lo agendaría,
      // y así no se pierde un scroll seguido de un clic inmediato.
      scrollByLocationKey.set(keyRef.current, el!.scrollTop);
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef]);
}
