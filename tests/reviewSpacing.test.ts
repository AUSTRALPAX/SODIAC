import { describe, expect, it } from "vitest";
import { addDaysIso, computeNextSchedule, INITIAL_SCHEDULE, isCooled } from "@/services/reviewSpacing";

describe("computeNextSchedule", () => {
  it("el primer repaso con 'bien' avanza al primer escalón (3 días)", () => {
    expect(computeNextSchedule(INITIAL_SCHEDULE, "bien")).toEqual({ streak: 1, intervalDays: 3 });
  });

  it("repasos consecutivos con 'bien' avanzan la secuencia", () => {
    let schedule = INITIAL_SCHEDULE;
    schedule = computeNextSchedule(schedule, "bien"); // streak 1 → 3 días
    schedule = computeNextSchedule(schedule, "bien"); // streak 2 → 7 días
    expect(schedule).toEqual({ streak: 2, intervalDays: 7 });
    schedule = computeNextSchedule(schedule, "bien"); // streak 3 → 16 días
    expect(schedule).toEqual({ streak: 3, intervalDays: 16 });
  });

  it("'facil' avanza dos pasos en vez de uno", () => {
    expect(computeNextSchedule(INITIAL_SCHEDULE, "facil")).toEqual({ streak: 2, intervalDays: 7 });
  });

  it("'otra_vez' reinicia la racha y el intervalo, sin importar el progreso previo", () => {
    const advanced = { streak: 4, intervalDays: 16 };
    expect(computeNextSchedule(advanced, "otra_vez")).toEqual({ streak: 0, intervalDays: 1 });
  });

  it("'dificil' mantiene la racha pero crece el intervalo solo un poco", () => {
    const prev = { streak: 3, intervalDays: 7 };
    const next = computeNextSchedule(prev, "dificil");
    expect(next.streak).toBe(3);
    expect(next.intervalDays).toBeGreaterThan(prev.intervalDays);
    expect(next.intervalDays).toBeLessThan(16); // no salta al siguiente escalón completo
  });

  it("el intervalo nunca supera el último escalón definido", () => {
    let schedule = INITIAL_SCHEDULE;
    for (let i = 0; i < 20; i++) {
      schedule = computeNextSchedule(schedule, "facil");
    }
    expect(schedule.intervalDays).toBe(120);
  });
});

describe("isCooled", () => {
  it("no está enfriado con intervalos cortos", () => {
    expect(isCooled({ streak: 3, intervalDays: 7 })).toBe(false);
  });

  it("se considera enfriado al llegar al umbral", () => {
    expect(isCooled({ streak: 6, intervalDays: 120 })).toBe(true);
  });
});

describe("addDaysIso", () => {
  it("suma días correctamente cruzando meses", () => {
    expect(addDaysIso("2026-07-30T00:00:00.000Z", 3)).toBe("2026-08-02T00:00:00.000Z");
  });

  it("con 0 días devuelve la misma fecha", () => {
    expect(addDaysIso("2026-07-01T12:00:00.000Z", 0)).toBe("2026-07-01T12:00:00.000Z");
  });
});
