import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { academicTranscriptEntriesRepo, learningStagesRepo, subjectsRepo } from "@/database/entities";
import { computeIpa } from "@/services/progress";
import { getLevelProgress } from "@/services/xp";
import { getRankForLevel } from "@/services/ranks";
import type { AcademicTranscriptEntryRow, SubjectRow } from "@/database/types";

export interface TranscriptFilters {
  subjectId?: string;
  stageId?: string;
  status?: "vigente" | "todas";
  fromDate?: string;
  toDate?: string;
}

export interface TranscriptData {
  careerName: string;
  issuedAt: string;
  curriculumVersion: string;
  disclaimer: string;
  level: number;
  xpTotal: number;
  rankName: string | null;
  ipaTotal: number;
  average10: number | null;
  entries: (AcademicTranscriptEntryRow & { subjectTitle: string })[];
}

export const TRANSCRIPT_DISCLAIMER =
  "Este expediente refleja el progreso dentro del sistema personal de estudio SODIAC. No constituye un título, certificación o acreditación académica oficial.";

export async function buildTranscriptData(filters: TranscriptFilters = {}): Promise<TranscriptData> {
  const [levelProgress, ipa, subjects] = await Promise.all([
    getLevelProgress(),
    computeIpa({ kind: "career" }),
    subjectsRepo.list(),
  ]);
  const rank = await getRankForLevel(levelProgress.level);

  let entries = await academicTranscriptEntriesRepo.list({ orderBy: "recorded_at DESC" });
  if (!filters.status || filters.status === "vigente") entries = entries.filter((e) => e.status === "vigente");
  if (filters.subjectId) entries = entries.filter((e) => e.subject_id === filters.subjectId);
  if (filters.fromDate) entries = entries.filter((e) => e.recorded_at >= filters.fromDate!);
  if (filters.toDate) entries = entries.filter((e) => e.recorded_at <= filters.toDate!);

  if (filters.stageId) {
    const stageSubjectIds = new Set(
      subjects.filter((s) => s.fundamental_question_id === filters.stageId).map((s) => s.id),
    );
    entries = entries.filter((e) => e.subject_id && stageSubjectIds.has(e.subject_id));
  }

  const subjectTitle = (id: string | null) => subjects.find((s) => s.id === id)?.title ?? "—";
  const average10 = entries.length > 0 ? entries.reduce((sum, e) => sum + e.score_10, 0) / entries.length : null;

  return {
    careerName: "Instituto de Asignación de Capital, Creación de Valor y Pensamiento Sistémico",
    issuedAt: new Date().toISOString(),
    curriculumVersion: "v1.0.0",
    disclaimer: TRANSCRIPT_DISCLAIMER,
    level: levelProgress.level,
    xpTotal: levelProgress.xpTotal,
    rankName: rank?.name ?? null,
    ipaTotal: ipa.total,
    average10,
    entries: entries.map((e) => ({ ...e, subjectTitle: subjectTitle(e.subject_id) })),
  };
}

function buildMarkdown(data: TranscriptData): string {
  const lines: string[] = [];
  lines.push("# EXPEDIENTE ACADÉMICO SODIAC", "");
  lines.push(`**Carrera:** ${data.careerName}`);
  lines.push(`**Emitido:** ${new Date(data.issuedAt).toLocaleString("es-AR")}`);
  lines.push(`**Versión del currículo:** ${data.curriculumVersion}`, "");
  lines.push(`**Nivel:** ${data.level} · **Rango:** ${data.rankName ?? "—"} · **XP total:** ${Math.round(data.xpTotal)}`);
  lines.push(`**IPA total:** ${(data.ipaTotal * 100).toFixed(1)}% · **Promedio:** ${data.average10 != null ? data.average10.toFixed(1) : "—"}/10`, "");
  lines.push("| Trabajo | Materia | Tipo | Nota | Veredicto | Fecha |");
  lines.push("|---|---|---|---|---|---|");
  for (const e of data.entries) {
    lines.push(
      `| ${e.title} | ${e.subjectTitle} | ${e.work_type} | ${e.score_100}/100 (${e.score_10.toFixed(1)}/10) | ${e.verdict} | ${new Date(e.recorded_at).toLocaleDateString("es-AR")} |`,
    );
  }
  lines.push("", `_${data.disclaimer}_`);
  return lines.join("\n");
}

function buildCsv(data: TranscriptData): string {
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["title", "subject", "work_type", "score_100", "score_10", "verdict", "recorded_at"];
  const rows = data.entries.map((e) =>
    [e.title, e.subjectTitle, e.work_type, e.score_100, e.score_10, e.verdict, e.recorded_at].map(escape).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

function buildPrintableHtml(data: TranscriptData): string {
  const rows = data.entries
    .map(
      (e) => `<tr>
      <td>${e.title}</td><td>${e.subjectTitle}</td><td>${e.work_type}</td>
      <td>${e.score_100}/100 (${e.score_10.toFixed(1)}/10)</td><td>${e.verdict}</td>
      <td>${new Date(e.recorded_at).toLocaleDateString("es-AR")}</td>
    </tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Expediente Académico SODIAC</title>
  <style>
    body { font-family: 'Space Grotesk', 'Inter', sans-serif; background: #090B0D; color: #F4F7F8; padding: 40px; }
    h1 { font-size: 22px; letter-spacing: 0.05em; }
    .meta { color: #9AA5AC; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #293037; padding: 8px; text-align: left; }
    th { text-transform: uppercase; letter-spacing: 0.08em; color: #9AA5AC; font-weight: 500; }
    .disclaimer { margin-top: 24px; font-size: 11px; color: #6F7980; }
    @media print { body { background: white; color: black; } th, td { border-color: #ccc; } .meta, .disclaimer { color: #555; } }
  </style>
  </head><body>
  <h1>EXPEDIENTE ACADÉMICO SODIAC</h1>
  <p class="meta">${data.careerName}<br/>
  Emitido: ${new Date(data.issuedAt).toLocaleString("es-AR")} · Versión del currículo: ${data.curriculumVersion}<br/>
  Nivel ${data.level} · ${data.rankName ?? "—"} · ${Math.round(data.xpTotal)} XP · IPA ${(data.ipaTotal * 100).toFixed(1)}% · Promedio ${data.average10 != null ? data.average10.toFixed(1) : "—"}/10</p>
  <table><thead><tr><th>Trabajo</th><th>Materia</th><th>Tipo</th><th>Nota</th><th>Veredicto</th><th>Fecha</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <p class="disclaimer">${data.disclaimer}</p>
  </body></html>`;
}

async function saveTextExport(content: string, extension: string, name: string): Promise<{ path: string } | null> {
  const path = await save({
    title: `Exportar expediente (${extension.toUpperCase()})`,
    defaultPath: `${name}.${extension}`,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (!path) return null;
  await writeTextFile(path, content);
  return { path };
}

export async function exportTranscriptJson(filters?: TranscriptFilters): Promise<{ path: string } | null> {
  const data = await buildTranscriptData(filters);
  return saveTextExport(JSON.stringify(data, null, 2), "json", "expediente-sodiac");
}

export async function exportTranscriptMarkdown(filters?: TranscriptFilters): Promise<{ path: string } | null> {
  const data = await buildTranscriptData(filters);
  return saveTextExport(buildMarkdown(data), "md", "expediente-sodiac");
}

export async function exportTranscriptCsv(filters?: TranscriptFilters): Promise<{ path: string } | null> {
  const data = await buildTranscriptData(filters);
  return saveTextExport(buildCsv(data), "csv", "expediente-sodiac");
}

/**
 * "PDF" se resuelve como una vista HTML imprimible (sin dependencias nuevas,
 * 100% offline): el usuario la abre e imprime con "Microsoft Print to PDF"
 * desde el diálogo nativo de impresión de Windows. Devuelve el HTML para que
 * la UI lo muestre en una ventana/pestaña dedicada.
 */
export async function buildTranscriptPrintableHtml(filters?: TranscriptFilters): Promise<string> {
  const data = await buildTranscriptData(filters);
  return buildPrintableHtml(data);
}

export async function listStagesForFilter() {
  return learningStagesRepo.list({ where: "archived_at IS NULL", orderBy: "sort_order" });
}

export async function listSubjectsForFilter(): Promise<SubjectRow[]> {
  return subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" });
}

export async function currentRankName(): Promise<string | null> {
  const progress = await getLevelProgress();
  const rank = await getRankForLevel(progress.level);
  return rank?.name ?? null;
}
