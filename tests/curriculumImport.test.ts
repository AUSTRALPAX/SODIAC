import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumCsv,
  parseCurriculumJson,
  parseCurriculumMarkdown,
} from "@/services/curriculumImport";
import { validateCurriculumImport, type CurriculumImportData } from "@/schemas/curriculumImport";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const jsonText = readFileSync(path.join(fixturesDir, "curriculum-sample.json"), "utf-8");
const csvText = readFileSync(path.join(fixturesDir, "curriculum-sample.csv"), "utf-8");
const mdText = readFileSync(path.join(fixturesDir, "curriculum-sample.md"), "utf-8");

function expectFixtureShape(data: CurriculumImportData) {
  expect(data.stages).toHaveLength(2);
  expect(data.subjects).toHaveLength(3);
  expect(data.units).toHaveLength(2);
  expect(data.topics).toHaveLength(4);
  expect(data.activities).toHaveLength(2);
  expect(data.subjects.every((s) => s.fundamentalQuestionCode === "FQ0")).toBe(true);
  expect(data.topics.find((t) => t.code === null)?.subjectCode).toBe("M3");
  const activity = data.activities.find((a) => a.topicCode === "T1");
  expect(activity?.estimatedMinutes).toBe(45);
  expect(activity?.scheduledDate).toBe("2026-08-03");
}

describe("Importador de currículo (Fase D) — fixture de prueba, no el currículo real", () => {
  it("parsea JSON al esquema intermedio y valida sin errores", () => {
    const raw = parseCurriculumJson(jsonText);
    const result = validateCurriculumImport(raw);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expectFixtureShape(result.data!);
  });

  it("parsea CSV (formato largo) al mismo esquema intermedio", () => {
    const raw = parseCurriculumCsv(csvText);
    const result = validateCurriculumImport(raw);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expectFixtureShape(result.data!);
  });

  it("parsea Markdown (encabezados anidados) al mismo esquema intermedio", () => {
    const raw = parseCurriculumMarkdown(mdText);
    const result = validateCurriculumImport(raw);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expectFixtureShape(result.data!);
  });

  it("los tres formatos producen datos equivalentes (mismos títulos por materia)", () => {
    const fromJson = validateCurriculumImport(parseCurriculumJson(jsonText)).data!;
    const fromCsv = validateCurriculumImport(parseCurriculumCsv(csvText)).data!;
    const fromMd = validateCurriculumImport(parseCurriculumMarkdown(mdText)).data!;

    const titles = (d: CurriculumImportData) => d.subjects.map((s) => s.title).sort();
    expect(titles(fromCsv)).toEqual(titles(fromJson));
    expect(titles(fromMd)).toEqual(titles(fromJson));
  });

  it("rechaza una unidad que referencia una materia inexistente en el documento", () => {
    const raw = JSON.parse(jsonText) as CurriculumImportData;
    raw.units[0]!.subjectCode = "MATERIA_INEXISTENTE";
    const result = validateCurriculumImport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("MATERIA_INEXISTENTE"))).toBe(true);
  });

  it("rechaza códigos de materia duplicados dentro del mismo documento", () => {
    const raw = JSON.parse(jsonText) as CurriculumImportData;
    raw.subjects.push({ ...raw.subjects[0]! });
    const result = validateCurriculumImport(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicado"))).toBe(true);
  });
});
