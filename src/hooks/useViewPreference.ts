import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { registerPendingSave } from "@/services/closeGuard";
import { loadViewPreference, resetViewPreference, saveViewPreference } from "@/services/viewPreferences";

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Carga y persiste "cómo el usuario dejó organizada" una sección (orden,
 * filtros, panel expandido, pestaña activa) contra `user_setting` — ver
 * `services/viewPreferences.ts`. Guarda con debounce salvo que se pida
 * inmediato (toggles/selects), y flushea el valor pendiente al desmontar la
 * vista y al cerrar la app (vía el mismo mecanismo de H4,
 * `services/closeGuard.ts`).
 */
export function useViewPreference<T>(
  workspaceKey: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  defaults: T,
  options?: { debounceMs?: number },
) {
  const [value, setValue] = useState<T>(defaults);
  const [loaded, setLoaded] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void loadViewPreference(workspaceKey, schema, defaults).then((loadedValue) => {
      if (!cancelled) {
        setValue(loadedValue);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  useEffect(
    () =>
      registerPendingSave(async () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        await saveViewPreference(workspaceKey, valueRef.current);
      }),
    [workspaceKey],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void saveViewPreference(workspaceKey, valueRef.current);
    },
    [workspaceKey],
  );

  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => T), opts?: { immediate?: boolean }) => {
      setValue((prev) => {
        const next = typeof patch === "function" ? (patch as (p: T) => T)(prev) : { ...prev, ...patch };
        if (timerRef.current) clearTimeout(timerRef.current);
        if (opts?.immediate) {
          void saveViewPreference(workspaceKey, next);
        } else {
          timerRef.current = setTimeout(() => {
            void saveViewPreference(workspaceKey, next);
          }, debounceMs);
        }
        return next;
      });
    },
    [workspaceKey, debounceMs],
  );

  const reset = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await resetViewPreference(workspaceKey);
    setValue(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  return { value, update, reset, loaded };
}
