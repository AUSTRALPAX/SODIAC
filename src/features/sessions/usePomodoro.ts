import { useCallback, useEffect, useRef, useState } from "react";

export type PomodoroPhase = "foco" | "pausa_corta" | "pausa_larga";

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

function minutesFor(phase: PomodoroPhase, settings: PomodoroSettings): number {
  if (phase === "foco") return settings.focusMinutes;
  if (phase === "pausa_corta") return settings.shortBreakMinutes;
  return settings.longBreakMinutes;
}

/**
 * Temporizador Pomodoro (prompt maestro §9). No persiste tick a tick: al
 * completar cada fase (o al saltarla manualmente) llama a `onPhaseComplete`
 * para que el llamador la registre como PomodoroCycle.
 */
export function usePomodoro(
  settings: PomodoroSettings,
  onPhaseComplete: (phase: PomodoroPhase, plannedMinutes: number, actualMinutes: number, interrupted: boolean) => void,
) {
  const [phase, setPhase] = useState<PomodoroPhase>("foco");
  const [cycleIndex, setCycleIndex] = useState(1);
  const [remainingSeconds, setRemainingSeconds] = useState(settings.focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const plannedSecondsRef = useRef(settings.focusMinutes * 60);

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

      let nextPhase: PomodoroPhase;
      let nextCycle = cycleIndex;
      if (phase === "foco") {
        nextPhase = cycleIndex % settings.cyclesBeforeLongBreak === 0 ? "pausa_larga" : "pausa_corta";
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
    },
    [phase, cycleIndex, remainingSeconds, settings, onPhaseComplete],
  );

  useEffect(() => {
    if (running && remainingSeconds === 0) {
      advancePhase(false);
    }
  }, [running, remainingSeconds, advancePhase]);

  function start() {
    startedAtRef.current = Date.now();
    setRunning(true);
  }
  function pause() {
    setRunning(false);
  }
  function skip() {
    advancePhase(true);
  }

  return { phase, cycleIndex, remainingSeconds, running, start, pause, skip };
}
