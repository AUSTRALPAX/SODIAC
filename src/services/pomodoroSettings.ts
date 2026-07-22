import { getSetting, setSetting } from "@/services/settings";

const SETTINGS_KEY = "pomodoro_settings";
/** Key vieja del widget del Dashboard (Fase Pomodoro) — se lee una sola vez como
 * fallback de migración para no resetear la configuración que el usuario ya tenía
 * puesta ahí, pero nunca se vuelve a escribir. */
const LEGACY_DASHBOARD_SETTINGS_KEY = "pomodoro_dashboard_settings";

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  totalSessions: number;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 10,
  longBreakMinutes: 15,
  totalSessions: 4,
};

interface LegacyDashboardSettings {
  workMinutes: number;
  breakMinutes: number;
  totalSessions: number;
}

/**
 * Configuración única de Pomodoro compartida entre el widget del Dashboard y
 * el temporizador de "Iniciar estudio" (antes eran dos implementaciones
 * independientes con valores por defecto distintos — 25/10/4 vs 25/5/∞ — que
 * nunca se comunicaban entre sí).
 */
export async function getPomodoroSettings(): Promise<PomodoroSettings> {
  const current = await getSetting<PomodoroSettings>(SETTINGS_KEY);
  if (current) return current;

  const legacy = await getSetting<LegacyDashboardSettings>(LEGACY_DASHBOARD_SETTINGS_KEY);
  if (legacy) {
    return {
      focusMinutes: legacy.workMinutes,
      shortBreakMinutes: legacy.breakMinutes,
      longBreakMinutes: DEFAULT_POMODORO_SETTINGS.longBreakMinutes,
      totalSessions: legacy.totalSessions,
    };
  }

  return DEFAULT_POMODORO_SETTINGS;
}

export async function setPomodoroSettings(settings: PomodoroSettings): Promise<void> {
  await setSetting(SETTINGS_KEY, settings);
}

/** Beep corto sintetizado (sin assets ni plugin de Tauri) para marcar el cambio de fase. */
export function playPomodoroBeep(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // El navegador puede bloquear AudioContext sin interacción previa del usuario — no es crítico.
  }
}
