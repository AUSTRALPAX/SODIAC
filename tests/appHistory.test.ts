import { describe, expect, it } from "vitest";
import { nextMaxIndex, parentPathFor } from "@/hooks/useAppHistory";

describe("parentPathFor", () => {
  it("sube de un detalle de materia a Carrera", () => {
    expect(parentPathFor("/carrera/abc-123")).toBe("/carrera");
  });

  it("sube de una sesión a Sesiones", () => {
    expect(parentPathFor("/sesiones/xyz-789")).toBe("/sesiones");
  });

  it("el índice de Carrera no se considera detalle", () => {
    expect(parentPathFor("/carrera")).toBe("/dashboard");
  });

  it("cualquier otra ruta cae al Dashboard", () => {
    expect(parentPathFor("/biblioteca")).toBe("/dashboard");
    expect(parentPathFor("/")).toBe("/dashboard");
  });
});

describe("nextMaxIndex", () => {
  it("un PUSH trunca el historial hacia adelante", () => {
    // Estabas en 1 de una pila de 5 y navegás a algo nuevo: el 2..5 se pierde.
    expect(nextMaxIndex(5, 2, "PUSH")).toBe(2);
  });

  it("un POP hacia atrás conserva el máximo alcanzado", () => {
    expect(nextMaxIndex(5, 3, "POP")).toBe(5);
  });

  it("un POP hacia adelante no baja el máximo", () => {
    expect(nextMaxIndex(5, 5, "POP")).toBe(5);
  });

  it("un REPLACE no altera el alcance del historial", () => {
    expect(nextMaxIndex(4, 2, "REPLACE")).toBe(4);
  });

  it("el primer render deja máximo igual al índice actual", () => {
    expect(nextMaxIndex(0, 0, "POP")).toBe(0);
  });
});

describe("estado de los botones derivado del índice", () => {
  const canGoBack = (idx: number) => idx > 0;
  const canGoForward = (idx: number, maxIdx: number) => idx < maxIdx;

  it("en la primera entrada no se puede volver", () => {
    expect(canGoBack(0)).toBe(false);
  });

  it("en el tope de la pila no se puede avanzar", () => {
    expect(canGoForward(3, 3)).toBe(false);
  });

  it("en el medio de la pila se puede en ambos sentidos", () => {
    expect(canGoBack(2)).toBe(true);
    expect(canGoForward(2, 4)).toBe(true);
  });

  it("tras un PUSH desde el medio, adelante queda deshabilitado", () => {
    const max = nextMaxIndex(5, 3, "PUSH");
    expect(canGoForward(3, max)).toBe(false);
    expect(canGoBack(3)).toBe(true);
  });
});
