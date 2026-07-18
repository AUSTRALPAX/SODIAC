import { useEffect, useState } from "react";
import { getLevelHistory, listXpHistory } from "@/services/xp";
import { subjectsRepo } from "@/database/entities";
import type { AcademicLevelHistoryRow, SubjectRow, XpEventRow } from "@/database/types";

const CATEGORY_LABEL: Record<string, string> = {
  notas_conceptuales: "Nota conceptual",
  ejercicios_practicas: "Ejercicio/práctica",
  aplicaciones_casos: "Aplicación/caso",
  proyecto_examen_integrador: "Proyecto/examen integrador",
  hitos_dominio: "Hito de dominio",
  revision_diferida_retencion: "Revisión diferida",
  intento: "Intento",
  finalizacion_tarea_hito: "Tarea o hito completado",
  finalizacion_tema: "Tema completado (sin validar)",
  validacion_conocimiento: "Validación de conocimiento aprobada",
  cierre_materia: "Materia cerrada",
};

export function ExperienceTab() {
  const [events, setEvents] = useState<XpEventRow[]>([]);
  const [levels, setLevels] = useState<AcademicLevelHistoryRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);

  useEffect(() => {
    void Promise.all([listXpHistory(200), getLevelHistory(), subjectsRepo.list()]).then(([e, l, s]) => {
      setEvents(e);
      setLevels(l);
      setSubjects(s);
    });
  }, []);

  const bySubject = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const e of events) {
    if (e.subject_id) bySubject.set(e.subject_id, (bySubject.get(e.subject_id) ?? 0) + e.amount);
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  const subjectTitle = (id: string) => subjects.find((s) => s.id === id)?.title ?? id;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Historial de experiencia</h3>
        <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto rounded border border-border-subtle bg-surface p-3 text-sm">
          {events.length === 0 && <li className="text-xs text-text-muted">Todavía no hay experiencia registrada.</li>}
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 border-b border-border-subtle py-1.5 text-xs last:border-0">
              <span className="text-text-secondary">
                {e.reason}
                <span className="ml-1 text-text-muted">({CATEGORY_LABEL[e.category] ?? e.category})</span>
              </span>
              <span className="shrink-0 text-accent">+{Math.round(e.amount)} XP</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">XP por materia</h3>
          <ul className="mt-2 space-y-1 rounded border border-border-subtle bg-surface p-3 text-xs">
            {Array.from(bySubject.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([id, amount]) => (
                <li key={id} className="flex justify-between">
                  <span className="text-text-secondary">{subjectTitle(id)}</span>
                  <span className="text-text-primary">{Math.round(amount)} XP</span>
                </li>
              ))}
            {bySubject.size === 0 && <li className="text-text-muted">Sin datos todavía.</li>}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">XP por tipo de evidencia</h3>
          <ul className="mt-2 space-y-1 rounded border border-border-subtle bg-surface p-3 text-xs">
            {Array.from(byCategory.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amount]) => (
                <li key={cat} className="flex justify-between">
                  <span className="text-text-secondary">{CATEGORY_LABEL[cat] ?? cat}</span>
                  <span className="text-text-primary">{Math.round(amount)} XP</span>
                </li>
              ))}
            {byCategory.size === 0 && <li className="text-text-muted">Sin datos todavía.</li>}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Historial de ascensos</h3>
          <ul className="mt-2 space-y-1 rounded border border-border-subtle bg-surface p-3 text-xs">
            {levels.length === 0 && <li className="text-text-muted">Todavía no hay ascensos registrados.</li>}
            {levels.map((l) => (
              <li key={l.id} className="flex justify-between">
                <span className="text-text-secondary">Nivel {l.level}</span>
                <span className="text-text-muted">{new Date(l.reached_at).toLocaleDateString("es-AR")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
