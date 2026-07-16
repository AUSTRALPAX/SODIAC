import { useCallback, useEffect, useState } from "react";
import { subjectsRepo } from "@/database/entities";
import { computeIpa } from "@/services/progress";
import { getSubjectXpBudgetTotal, getSubjectXpTotal } from "@/services/xp";
import type { SubjectRow } from "@/database/types";

interface SubjectRowData {
  subject: SubjectRow;
  ipa: number;
  xp: number;
  budgetTotal: number;
}

export function SubjectsProgressTab() {
  const [rows, setRows] = useState<SubjectRowData[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const subjects = await subjectsRepo.list({ where: "archived_at IS NULL", orderBy: "title" });
    const data: SubjectRowData[] = [];
    for (const subject of subjects) {
      const [ipaResult, xp, budget] = await Promise.all([
        computeIpa({ kind: "subject", subjectId: subject.id }),
        getSubjectXpTotal(subject.id),
        getSubjectXpBudgetTotal(subject.id),
      ]);
      data.push({ subject, ipa: ipaResult.total, xp, budgetTotal: budget.total });
    }
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <p className="text-sm text-text-muted">Cargando…</p>;

  return (
    <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2">Materia</th>
            <th className="px-3 py-2">Créditos</th>
            <th className="px-3 py-2">XP presupuestada</th>
            <th className="px-3 py-2">XP obtenida</th>
            <th className="px-3 py-2">IPA de la materia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ subject, ipa, xp, budgetTotal }) => (
            <tr key={subject.id} className="border-b border-border-subtle last:border-0">
              <td className="px-3 py-2 text-text-primary">{subject.title}</td>
              <td className="px-3 py-2 text-text-secondary">{subject.credits}</td>
              <td className="px-3 py-2 text-text-secondary">{Math.round(budgetTotal).toLocaleString("es-AR")}</td>
              <td className="px-3 py-2 text-text-secondary">{Math.round(xp).toLocaleString("es-AR")}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded bg-background">
                    <div className="h-full bg-accent" style={{ width: `${Math.min(100, ipa * 100)}%` }} />
                  </div>
                  <span className="text-xs text-text-muted">{(ipa * 100).toFixed(1)}%</span>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-text-muted">
                No hay materias registradas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
