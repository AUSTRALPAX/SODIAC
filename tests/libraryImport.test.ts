import { describe, expect, it } from "vitest";
import { normalizeKey } from "@/services/libraryImport";
import libraryInstitutionalSeed from "../seed/library-institutional.json";

interface SeedEntry {
  area: string;
  author: string;
  title: string;
}

const seed = libraryInstitutionalSeed as SeedEntry[];

describe("Base Bibliográfica Inicial", () => {
  it("contiene exactamente 39 recursos institucionales", () => {
    expect(seed.length).toBe(39);
  });

  it("no tiene duplicados por clave normalizada área+autor+título", () => {
    const keys = seed.map((e) => normalizeKey(e.area, e.author, e.title));
    expect(new Set(keys).size).toBe(39);
  });

  it("normaliza ignorando mayúsculas, tildes, espacios y signos menores", () => {
    const a = normalizeKey("Economía Austríaca", "Ludwig von Mises", "La acción humana");
    const b = normalizeKey("  economia austriaca  ", "LUDWIG VON MISES", "la, acción humana.");
    expect(a).toBe(b);
  });
});
