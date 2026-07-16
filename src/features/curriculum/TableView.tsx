import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MasteryBadge } from "./MasteryBadge";
import type { CurriculumData } from "./useCurriculumData";

type MasteryFilter = "todos" | "con_dominio" | "sin_dominio";

export function TableView({ data }: { data: CurriculumData }) {
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>("todos");

  const subjectById = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects]);
  const questionById = useMemo(() => new Map(data.questions.map((q) => [q.id, q])), [data.questions]);
  const stageById = useMemo(() => new Map(data.stages.map((s) => [s.id, s])), [data.stages]);

  const rows = useMemo(() => {
    return data.topics
      .map((topic) => {
        const subject = subjectById.get(topic.subject_id);
        const question = subject ? questionById.get(subject.fundamental_question_id) : undefined;
        const stage = topic.learning_stage_id ? stageById.get(topic.learning_stage_id) : undefined;
        const mastery = topic.competency_id ? data.masteryByCompetency.get(topic.competency_id) : undefined;
        return { topic, subject, question, stage, level: mastery ? mastery.level : null };
      })
      .filter((r) => !search || r.topic.title.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => !subjectFilter || r.subject?.id === subjectFilter)
      .filter((r) => {
        if (masteryFilter === "con_dominio") return r.level !== null;
        if (masteryFilter === "sin_dominio") return r.level === null;
        return true;
      });
  }, [data.topics, subjectById, questionById, stageById, data.masteryByCompetency, search, subjectFilter, masteryFilter]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tema…"
          className="rounded border border-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Todas las materias</option>
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          value={masteryFilter}
          onChange={(e) => setMasteryFilter(e.target.value as MasteryFilter)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="todos">Todos</option>
          <option value="con_dominio">Con dominio registrado</option>
          <option value="sin_dominio">Sin dominio registrado</option>
        </select>
        <span className="self-center text-xs text-text-muted">{rows.length} temas</span>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Tema</th>
              <th className="px-3 py-2">Materia</th>
              <th className="px-3 py-2">Pregunta fundamental</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Dominio</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ topic, subject, question, stage, level }) => (
              <tr key={topic.id} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 text-text-primary">{topic.title}</td>
                <td className="px-3 py-2 text-text-secondary">{subject?.title ?? "—"}</td>
                <td className="px-3 py-2 text-text-secondary">{question?.title ?? "—"}</td>
                <td className="px-3 py-2 text-text-secondary">{stage?.title ?? "—"}</td>
                <td className="px-3 py-2">
                  <MasteryBadge level={level} />
                </td>
                <td className="px-3 py-2">
                  <Link
                    to={`/sesiones/nueva?${new URLSearchParams({
                      topicId: topic.id,
                      subjectId: topic.subject_id,
                      ...(topic.competency_id ? { competencyId: topic.competency_id } : {}),
                      ...(subject ? { fundamentalQuestionId: subject.fundamental_question_id } : {}),
                      objective: `Estudiar: ${topic.title}`,
                    }).toString()}`}
                    className="whitespace-nowrap rounded border border-accent px-2 py-1 text-xs text-accent"
                  >
                    Iniciar sesión
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  Sin resultados para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
