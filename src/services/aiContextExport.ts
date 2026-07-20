import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  learningEvidenceRepo,
  obsidianNotesRepo,
  resourcesRepo,
  studySessionsRepo,
  subjectsRepo,
  topicsRepo,
} from "@/database/entities";
import { getBibliographyForSubject } from "@/services/library";

const SESSION_TYPE_LABEL: Record<string, string> = {
  explicacion: "Explicación",
  debate: "Debate",
  lectura: "Lectura",
  ejercicio: "Ejercicio",
  laboratorio: "Laboratorio",
  revision: "Revisión",
  aplicacion: "Aplicación",
  produccion_escrita: "Producción escrita",
};

function bulletLines(items: string[]): string {
  return items.map((line) => `- ${line}`).join("\n");
}

/**
 * "Paquete de contexto IA" (Fase 6): Markdown de todas las sesiones de
 * estudio con su evidencia, notas de Obsidian vinculadas y bibliografía
 * de la materia — pensado para pegar en NotebookLM/ChatGPT como contexto.
 * Cumple docs/SECURITY_AND_BACKUPS.md §4 (solo la parte "Markdown para
 * contenidos académicos" — el paquete comprimido de base+configuración
 * queda para una fase futura).
 */
export async function buildAcademicMarkdown(): Promise<string> {
  const sessions = await studySessionsRepo.list({ orderBy: "started_at ASC" });

  const lines: string[] = ["# SODIAC — Paquete de contexto académico", "", `_Generado: ${new Date().toISOString()}_`, ""];

  for (const session of sessions) {
    const subject = session.subject_id ? await subjectsRepo.getById(session.subject_id) : null;
    const topic = session.topic_id ? await topicsRepo.getById(session.topic_id) : null;

    const dateLabel = session.started_at ? new Date(session.started_at).toLocaleDateString("es-AR") : "sin fecha";
    const heading = [dateLabel, subject?.title, topic?.title].filter(Boolean).join(" · ");
    lines.push(`## ${heading}`, "");

    const meta: string[] = [];
    meta.push(`**Tipo:** ${SESSION_TYPE_LABEL[session.session_type] ?? session.session_type} · **Estado:** ${session.closure_status}`);
    if (session.observable_objective) meta.push(`**Objetivo:** ${session.observable_objective}`);
    if (session.conclusion) meta.push(`**Conclusión:** ${session.conclusion}`);
    if (session.next_action || session.continuity_point) {
      const parts = [session.next_action, session.continuity_point].filter(Boolean).join(" — ");
      meta.push(`**Próxima acción / continuidad:** ${parts}`);
    }
    lines.push(bulletLines(meta), "");

    const evidence = await learningEvidenceRepo.list({ where: "study_session_id = ?", params: [session.id] });
    if (evidence.length > 0) {
      lines.push(
        "### Evidencia",
        "",
        bulletLines(evidence.map((e) => `${e.title} (${e.evidence_type})${e.description ? `: ${e.description}` : ""}`)),
        "",
      );
    }

    const noteIds = evidence.map((e) => e.obsidian_note_id).filter((id): id is string => !!id);
    if (noteIds.length > 0) {
      const notes = (await Promise.all(noteIds.map((id) => obsidianNotesRepo.getById(id)))).filter((n) => n != null);
      if (notes.length > 0) {
        lines.push(
          "### Notas de Obsidian",
          "",
          bulletLines(notes.map((n) => `${n!.title ?? n!.vault_relative_path} (${n!.vault_relative_path})`)),
          "",
        );
      }
    }

    if (session.subject_id) {
      const bibliography = await getBibliographyForSubject(session.subject_id);
      if (bibliography.length > 0) {
        const resources = await Promise.all(bibliography.map((b) => resourcesRepo.getById(b.resource_id)));
        const bibLines = bibliography
          .map((b, i) => {
            const resource = resources[i];
            if (!resource) return null;
            return `${resource.title}${b.relation_type ? ` — ${b.relation_type}` : ""}`;
          })
          .filter((line): line is string => !!line);
        if (bibLines.length > 0) {
          lines.push("### Bibliografía de la materia", "", bulletLines(bibLines), "");
        }
      }
    }
  }

  return lines.join("\n");
}

export async function exportAcademicMarkdown(): Promise<{ path: string } | null> {
  const markdown = await buildAcademicMarkdown();

  const path = await save({
    title: "Exportar contenidos académicos (Markdown)",
    defaultPath: `sodiac-contexto-academico-${Date.now()}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return null;

  await writeTextFile(path, markdown);
  return { path };
}
