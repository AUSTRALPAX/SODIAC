import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_POMODORO_SETTINGS,
  getPomodoroSettings,
  playPomodoroBeep,
  setPomodoroSettings,
  type PomodoroSettings,
} from "@/services/pomodoroSettings";

type Phase = "trabajo" | "descanso";

function secondsFor(phase: Phase, settings: PomodoroSettings): number {
  return (phase === "trabajo" ? settings.focusMinutes : settings.shortBreakMinutes) * 60;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Temporizador Pomodoro independiente para el Dashboard (no vinculado a una
 * sesión de estudio, a diferencia de usePomodoro en features/sessions — ese
 * persiste PomodoroCycle contra una study_session activa, y acá no hay
 * ninguna). Trabajo/descanso 0-60 min y cantidad de sesiones son totalmente
 * configurables y avanzan solos: si una fase queda en 0 minutos se salta
 * sin sonar, para permitir por ejemplo "sin descanso".
 */
export function PomodoroSection() {
  const [settings, setSettingsState] = useState<PomodoroSettings>(DEFAULT_POMODORO_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<Phase>("trabajo");
  const [sessionIndex, setSessionIndex] = useState(1);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_POMODORO_SETTINGS.focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    void getPomodoroSettings().then((next) => {
      setSettingsState(next);
      setRemainingSeconds(secondsFor("trabajo", next));
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemainingSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  // Avanza a la próxima fase, saltando en silencio cualquier fase configurada en 0 minutos.
  const advance = useCallback(() => {
    let p = phase;
    let idx = sessionIndex;
    for (let i = 0; i < 1000; i++) {
      if (p === "trabajo") {
        p = "descanso";
      } else {
        const next = idx + 1;
        if (next > settingsRef.current.totalSessions) {
          setRunning(false);
          setFinished(true);
          playPomodoroBeep();
          return;
        }
        idx = next;
        p = "trabajo";
      }
      const duration = secondsFor(p, settingsRef.current);
      if (duration > 0) {
        setPhase(p);
        setSessionIndex(idx);
        setRemainingSeconds(duration);
        playPomodoroBeep();
        return;
      }
    }
    // Las 1000 iteraciones son un límite de seguridad (todas las fases en 0 min): no debería alcanzarse nunca.
    setRunning(false);
    setFinished(true);
  }, [phase, sessionIndex]);

  useEffect(() => {
    if (running && remainingSeconds === 0 && !finished) advance();
  }, [running, remainingSeconds, finished, advance]);

  function updateSettings(patch: Partial<PomodoroSettings>) {
    // Forma funcional: si dos campos cambian antes de que React vuelva a
    // renderizar (por ejemplo al editar varios inputs rápido), leer `settings`
    // por closure aquí perdería el primer cambio al pisarlo con un objeto
    // desactualizado.
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      void setPomodoroSettings(next);
      return next;
    });
  }

  function handleReset() {
    setRunning(false);
    setFinished(false);
    setPhase("trabajo");
    setSessionIndex(1);
    setRemainingSeconds(secondsFor("trabajo", settings));
  }

  function handleStartPause() {
    if (finished) return;
    setRunning((r) => !r);
  }

  if (!loaded) return null;

  const totalPhaseSeconds = secondsFor(phase, settings) || 1;
  const progressPct = finished ? 100 : Math.min(100, ((totalPhaseSeconds - remainingSeconds) / totalPhaseSeconds) * 100);

  return (
    <section className="rounded border border-border-subtle bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Temporizador Pomodoro</h2>
        {!finished && (
          <span className="text-xs text-text-muted">
            Sesión {sessionIndex} de {settings.totalSessions} · {phase === "trabajo" ? "Enfoque" : "Descanso"}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div className="text-center">
          {finished ? (
            <p className="font-display text-2xl text-accent">¡Listo!</p>
          ) : (
            <p className="font-display text-4xl tabular-nums text-text-primary">{formatTime(remainingSeconds)}</p>
          )}
          {finished && (
            <p className="mt-1 text-xs text-text-muted">
              Completaste {settings.totalSessions} sesión{settings.totalSessions === 1 ? "" : "es"} de enfoque.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {!finished && (
            <button
              onClick={handleStartPause}
              className="rounded border border-accent bg-accent/10 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-accent"
            >
              {running ? "Pausar" : "Iniciar"}
            </button>
          )}
          {!finished && (
            <button
              onClick={advance}
              disabled={running}
              className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
            >
              Saltar fase
            </button>
          )}
          <button
            onClick={handleReset}
            className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
          >
            Reiniciar
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
        <div
          className={`h-full rounded-full ${phase === "trabajo" ? "bg-accent" : "bg-warning"}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-3">
        <label className="text-xs text-text-secondary">
          Minutos de enfoque
          <input
            type="number"
            min={0}
            max={60}
            value={settings.focusMinutes}
            disabled={running}
            onChange={(e) => {
              const v = Math.min(60, Math.max(0, Number(e.target.value)));
              updateSettings({ focusMinutes: v });
              if (!running && phase === "trabajo" && !finished) setRemainingSeconds(v * 60);
            }}
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-40"
          />
        </label>
        <label className="text-xs text-text-secondary">
          Minutos de descanso
          <input
            type="number"
            min={0}
            max={60}
            value={settings.shortBreakMinutes}
            disabled={running}
            onChange={(e) => {
              const v = Math.min(60, Math.max(0, Number(e.target.value)));
              updateSettings({ shortBreakMinutes: v });
              if (!running && phase === "descanso" && !finished) setRemainingSeconds(v * 60);
            }}
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-40"
          />
        </label>
        <label className="text-xs text-text-secondary">
          Cantidad de sesiones
          <input
            type="number"
            min={1}
            max={20}
            value={settings.totalSessions}
            disabled={running}
            onChange={(e) => updateSettings({ totalSessions: Math.min(20, Math.max(1, Number(e.target.value))) })}
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-40"
          />
        </label>
      </div>
    </section>
  );
}
