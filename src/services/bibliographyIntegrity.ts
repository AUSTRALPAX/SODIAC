/**
 * Centro de integridad bibliográfica (sección 20 del pedido de importación
 * austrofinanciera). Mismo patrón de solo-lectura que
 * `computeAcademicIntegrityAudit` en curriculumReconciliation.ts: un
 * diagnóstico que no corrige nada automáticamente, más una única acción
 * correctiva segura (limpiar vínculos huérfanos, que son filas de
 * `bibliographic_source` sin ninguna FK real — no borran el recurso).
 */
import { getDb } from "@/database/client";
import { bibliographicSourcesRepo, resourcesRepo } from "@/database/entities";
import { IMPORT_VERSION } from "@/services/libraryAustrofinancialImport";

const EXPECTED_AUSTROFINANCIAL_WORKS = 110;

export interface BibliographyIntegrityAudit {
  expectedAustrofinancialWorks: number;
  importedAustrofinancialWorks: number;
  totalActiveResources: number;
  duplicateCatalogNumbers: { catalogNumber: number; count: number }[];
  resourcesWithoutCategory: number;
  resourcesWithoutYear: number;
  resourcesWithoutAccess: number;
  resourcesWithoutAcademicLinks: number;
  orphanedLinks: number; // bibliographic_source con las 4 FKs académicas + proyecto en null
}

export async function computeBibliographyIntegrityAudit(): Promise<BibliographyIntegrityAudit> {
  const db = await getDb();

  const [resources, links, catalogDupes] = await Promise.all([
    resourcesRepo.list({ where: "archived_at IS NULL" }),
    bibliographicSourcesRepo.list(),
    db.select<Array<{ catalogNumber: number; count: number }>>(
      `SELECT catalog_number as catalogNumber, COUNT(*) as count FROM resource
       WHERE archived_at IS NULL AND catalog_number IS NOT NULL
       GROUP BY catalog_number HAVING COUNT(*) > 1`,
    ),
  ]);

  const importedAustrofinancial = resources.filter((r) => r.import_batch === IMPORT_VERSION).length;
  const linkedResourceIds = new Set(
    links
      .filter((l) => l.subject_id || l.curriculum_unit_id || l.topic_id || l.project_id)
      .map((l) => l.resource_id),
  );
  const orphanedLinks = links.filter(
    (l) => !l.subject_id && !l.curriculum_unit_id && !l.topic_id && !l.project_id && !l.fundamental_question_id && !l.competency_id,
  ).length;

  return {
    expectedAustrofinancialWorks: EXPECTED_AUSTROFINANCIAL_WORKS,
    importedAustrofinancialWorks: importedAustrofinancial,
    totalActiveResources: resources.length,
    duplicateCatalogNumbers: catalogDupes,
    resourcesWithoutCategory: resources.filter((r) => !r.category).length,
    resourcesWithoutYear: resources.filter((r) => r.original_year == null).length,
    resourcesWithoutAccess: resources.filter((r) => !r.access_type).length,
    resourcesWithoutAcademicLinks: resources.filter((r) => !linkedResourceIds.has(r.id)).length,
    orphanedLinks,
  };
}

/** Único corrector automático seguro: borra vínculos sin ninguna FK real (no le hacen nada al recurso). */
export async function clearOrphanedBibliographicLinks(): Promise<number> {
  const links = await bibliographicSourcesRepo.list();
  const orphaned = links.filter(
    (l) => !l.subject_id && !l.curriculum_unit_id && !l.topic_id && !l.project_id && !l.fundamental_question_id && !l.competency_id,
  );
  const db = await getDb();
  for (const link of orphaned) {
    await db.execute("DELETE FROM bibliographic_source WHERE id = ?", [link.id]);
  }
  return orphaned.length;
}
