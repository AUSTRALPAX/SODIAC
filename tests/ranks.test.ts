import { describe, expect, it } from "vitest";
import academicRanksSeed from "../seed/academic-ranks.json";
import { rankInitials } from "@/services/ranks";

interface RankSeedEntry {
  name: string;
  subtitle: string;
  minimumLevel: number;
  maximumLevel: number;
}

const seed = academicRanksSeed as RankSeedEntry[];

describe("Rangos académicos (0-100)", () => {
  it("tiene exactamente 15 rangos", () => {
    expect(seed.length).toBe(15);
  });

  it("cubre 0-100 sin huecos ni superposiciones", () => {
    const sorted = [...seed].sort((a, b) => a.minimumLevel - b.minimumLevel);
    expect(sorted[0]!.minimumLevel).toBe(0);
    expect(sorted[sorted.length - 1]!.maximumLevel).toBe(100);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.minimumLevel).toBe(sorted[i - 1]!.maximumLevel + 1);
    }
  });

  it("el nivel 100 corresponde a Adam Smith", () => {
    const level100 = seed.find((r) => r.maximumLevel === 100);
    expect(level100?.name).toBe("Adam Smith");
  });

  it("el nivel 0 corresponde a Aspirante", () => {
    const level0 = seed.find((r) => r.minimumLevel === 0);
    expect(level0?.name).toBe("Aspirante");
  });
});

describe("Iniciales de rango", () => {
  it("genera iniciales ignorando partículas", () => {
    expect(rankInitials("Eugen von Böhm-Bawerk")).toBe("EB");
    expect(rankInitials("Adam Smith")).toBe("AS");
  });
});
