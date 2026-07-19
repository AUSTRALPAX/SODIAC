import { describe, expect, it } from "vitest";
import { sortHistoryEntries, type KnowledgeHistoryEntry } from "@/services/knowledgeHistory";

function entry(id: string, occurredAt: string): KnowledgeHistoryEntry {
  return {
    id,
    occurredAt,
    kind: "sesion_estudio",
    title: id,
    detail: null,
    topicId: null,
    subjectId: null,
  };
}

describe("sortHistoryEntries", () => {
  it("ordena de más reciente a más antiguo", () => {
    const entries = [entry("a", "2026-07-01T00:00:00.000Z"), entry("b", "2026-07-15T00:00:00.000Z"), entry("c", "2026-07-08T00:00:00.000Z")];
    expect(sortHistoryEntries(entries).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("mantiene el orden de inserción entre fechas iguales (estable)", () => {
    const entries = [entry("a", "2026-07-01T00:00:00.000Z"), entry("b", "2026-07-01T00:00:00.000Z")];
    expect(sortHistoryEntries(entries).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("no muta el arreglo original", () => {
    const entries = [entry("a", "2026-07-01T00:00:00.000Z"), entry("b", "2026-07-15T00:00:00.000Z")];
    const sorted = sortHistoryEntries(entries);
    expect(sorted).not.toBe(entries);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("arreglo vacío devuelve arreglo vacío", () => {
    expect(sortHistoryEntries([])).toEqual([]);
  });
});
