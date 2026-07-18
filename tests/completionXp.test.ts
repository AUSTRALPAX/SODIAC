import { describe, expect, it } from "vitest";
import {
  CATEGORY_WEIGHTS,
  COMPLETION_CATEGORY_WEIGHTS,
  COMPLETION_SHARE,
  GRADED_SHARE,
} from "@/services/xp";

describe("Presupuesto de finalización (Fase A) — coexistencia con el de trabajo calificado", () => {
  it("las 4 categorías de finalización suman exactamente 1.0 (20/36/24/20 %)", () => {
    const sum = Object.values(COMPLETION_CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
    expect(COMPLETION_CATEGORY_WEIGHTS.finalizacion_tarea_hito).toBeCloseTo(0.2);
    expect(COMPLETION_CATEGORY_WEIGHTS.finalizacion_tema).toBeCloseTo(0.36);
    expect(COMPLETION_CATEGORY_WEIGHTS.validacion_conocimiento).toBeCloseTo(0.24);
    expect(COMPLETION_CATEGORY_WEIGHTS.cierre_materia).toBeCloseTo(0.2);
  });

  it("completar sin validar + validar suman lo mismo que antes de dividir la categoría (0.6)", () => {
    const combined =
      COMPLETION_CATEGORY_WEIGHTS.finalizacion_tema + COMPLETION_CATEGORY_WEIGHTS.validacion_conocimiento;
    expect(combined).toBeCloseTo(0.6);
  });

  it("el pool graduado y el de finalización se reparten el mismo techo sin superponerse", () => {
    expect(GRADED_SHARE + COMPLETION_SHARE).toBeCloseTo(1.0);
  });

  it("el presupuesto de trabajo calificado (CATEGORY_WEIGHTS) no cambió con esta actualización", () => {
    const sum = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    // "intento" pesa 0 (se descuenta de la categoría real) — el resto suma 1.0.
    expect(sum).toBeCloseTo(1.0);
  });
});
