import { useCallback, useEffect, useRef, useState } from "react";
import { playPomodoroBeep, type PomodoroSettings } from "@/services/pomodoroSettings";

export type PomodoroPhase = "foco" | "pausa_corta" | "pausa_larga";

/** Cada cuántos ciclos de foco toca pausa larga en vez de pausa corta — fijo,
 * igual que antes de unificar la configuración con el widget del Dashboard. */
const CYCLES_BEFORE_LONG_BREAK = 4;

function minutesFor(phase: PomodoroPhase, settings: PomodoroSettings): number {
  if (phase === "foco") return settings.focusMinutes;
  if (phase === "pausa_corta") return settings.shortBreakMinutes;
  return settings.longBreakMinutes;
}

/**
 * Temporizador Pomodoro (prompt maestro §9). No persiste tick a tick: al
 * completar cada fase (o al saltarla manualmente) llama a `onPhaseComplete`
 * para que el llamador la registre como PomodoroCycle. `settings` viene de
 * `getPomodoroSettings()` (src/services/pomodoroSettings.ts) — la misma
 * configuración que usa el widget del Dashboard, para que ambos temporizadores
 * se comporten igual.
 */
export function usePomodoro(
  settings: PomodoroSettings,
  onPhaseComplete: (phase: PomodoroPhase, plannedMinutes: number, actualMinutes: number, interrupted: boolean) => void,
) {
  const [phase, setPhase] = useState<PomodoroPhase>("foco");
  const [cycleIndex, setCycleIndex] = useState(1);
  const [remainingSeconds, setRemainingSeconds] = useState(settings.focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const plannedSecondsRef = useRef(settings.focusMinutes * 60);

  // `settings` puede llegar en un valor por defecto en el primer render y
  // actualizarse poco después con la configuración real cargada de forma
  // asíncrona (getPomodoroSettings()) — mientras el usuario no arrancó el
  // primer ciclo, hay que resincronizar la cuenta regresiva con el valor real.
  useEffect(() => {
    if (running || cycleIndex !== 1 || phase !== "foco") return;
    const seconds = minutesFor("foco", settings) * 60;
    plannedSecondsRef.current = seconds;
    setRemainingSeconds(seconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemainingSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  const advancePhase = useCallback(
    (interrupted: boolean) => {
      const actualSeconds = plannedSecondsRef.current - remainingSeconds;
      onPhaseComplete(phase, plannedSecondsRef.current / 60, Math.max(1, Math.round(actualSeconds / 60)), interrupted);

      if (phase === "foco" && cycleIndex >= settings.totalSessions) {
        setRunning(false);
        setFinished(true);
        playPomodoroBeep();
        return;
      }

      let nextPhase: PomodoroPhase;
      let nextCycle = cycleIndex;
      if (phase === "foco") {
        nextPhase = cycleIndex % CYCLES_BEFORE_LONG_BREAK === 0 ? "pausa_larga" : "pausa_corta";
      } else {
        nextPhase = "foco";
        nextCycle = cycleIndex + 1;
      }
      setPhase(nextPhase);
      setCycleIndex(nextCycle);
      const nextMinutes = minutesFor(nextPhase, settings);
      plannedSecondsRef.current = nextMinutes * 60;
      setRemainingSeconds(nextMinutes * 60);
      setRunning(false);
      playPomodoroBeep();
    },
    [phase, cycleIndex, remainingSeconds, settings, onPhaseComplete],
  );

  useEffect(() => {
    if (running && remainingSeconds === 0) {
      advancePhase(false);
    }
  }, [running, remainingSeconds, advancePhase]);

  function start() {
    if (finished) return;
    startedAtRef.current = Date.now();
    setRunning(true);
  }
  function pause() {
    setRunning(false);
  }
  function skip() {
    if (finished) return;
    advancePhase(true);
  }

  return { phase, cycleIndex, remainingSeconds, running, finished, start, pause, skip };
}
