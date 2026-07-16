import { describe, expect, it } from "vitest";
import { CAREER_TOTAL_XP, MAX_LEVEL, levelFromXp, scoreMultiplier, xpRequiredForLevel } from "@/services/xp";

describe("Curva de nivel (0-100, 100.000 XP)", () => {
  it("nivel 0 requiere 0 XP y nivel 100 requiere exactamente 100.000 XP", () => {
    expect(xpRequiredForLevel(0)).toBe(0);
    expect(xpRequiredForLevel(MAX_LEVEL)).toBe(CAREER_TOTAL_XP);
  });

  it("es monótona creciente", () => {
    let previous = -1;
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const xp = xpRequiredForLevel(level);
      expect(xp).toBeGreaterThanOrEqual(previous);
      previous = xp;
    }
  });

  it("los primeros niveles avanzan más rápido que los últimos (curva convexa)", () => {
    const early = xpRequiredForLevel(10) - xpRequiredForLevel(0);
    const late = xpRequiredForLevel(100) - xpRequiredForLevel(90);
    expect(early).toBeLessThan(late);
  });

  it("levelFromXp invierte xpRequiredForLevel para cada nivel exacto", () => {
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const xp = xpRequiredForLevel(level);
      expect(levelFromXp(xp)).toBe(level);
    }
  });

  it("levelFromXp nunca excede el nivel máximo ni baja de 0", () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(-100)).toBe(0);
    expect(levelFromXp(CAREER_TOTAL_XP * 2)).toBe(MAX_LEVEL);
  });
});

describe("Multiplicador por calificación", () => {
  it("nunca supera 100%", () => {
    for (let score = 0; score <= 100; score++) {
      expect(scoreMultiplier(score)).toBeLessThanOrEqual(1);
    }
  });

  it("respeta los tramos definidos", () => {
    expect(scoreMultiplier(0)).toBeCloseTo(0.10);
    expect(scoreMultiplier(49)).toBeCloseTo(0.10);
    expect(scoreMultiplier(55)).toBeCloseTo(0.35);
    expect(scoreMultiplier(65)).toBeCloseTo(0.60);
    expect(scoreMultiplier(75)).toBeCloseTo(0.78);
    expect(scoreMultiplier(85)).toBeCloseTo(0.90);
    expect(scoreMultiplier(100)).toBeCloseTo(1.0);
  });
});
