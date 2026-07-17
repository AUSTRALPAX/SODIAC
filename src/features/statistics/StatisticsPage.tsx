import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getBibliographyStats,
  getBlockDistribution,
  getBottlenecks,
  getMasteryEvolution,
  getReviewStats,
  getSessionActivity,
  getSubjectCompletionRates,
  getXpEvolution,
  type BibliographyStats,
  type BlockDistribution,
  type MasteryEvolutionPoint,
  type ReviewStats,
  type SessionActivityDay,
  type SubjectBottleneck,
  type SubjectCompletionRate,
  type XpEvolutionPoint,
} from "@/services/statistics";
import { getLevelProgress, type LevelProgress } from "@/services/xp";
import { getRankForLevel } from "@/services/ranks";
import type { AcademicRankRow } from "@/database/types";

const AXIS_COLOR = "#6F7980";
const GRID_COLOR = "#1D2328";
const TOOLTIP_STYLE = {
  background: "#171B20",
  border: "1px solid #293037",
  borderRadius: 6,
  fontSize: 12,
  color: "#F4F7F8",
};

function formatDay(day: string): string {
  return new Date(day).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function StatisticsPage() {
  const [activity, setActivity] = useState<SessionActivityDay[]>([]);
  const [mastery, setMastery] = useState<MasteryEvolutionPoint[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [blocks, setBlocks] = useState<BlockDistribution | null>(null);
  const [bottlenecks, setBottlenecks] = useState<SubjectBottleneck[]>([]);
  const [xpEvolution, setXpEvolution] = useState<XpEvolutionPoint[]>([]);
  const [completionRates, setCompletionRates] = useState<SubjectCompletionRate[]>([]);
  const [levelProgress, setLevelProgress] = useState<LevelProgress | null>(null);
  const [rank, setRank] = useState<AcademicRankRow | null>(null);
  const [bibliography, setBibliography] = useState<BibliographyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      getSessionActivity(14),
      getMasteryEvolution(),
      getReviewStats(),
      getBlockDistribution(),
      getBottlenecks(5),
      getXpEvolution(30),
      getSubjectCompletionRates(),
      getLevelProgress(),
      getBibliographyStats(),
    ]).then(async ([a, m, r, b, bo, xp, cr, lp, bib]) => {
      setActivity(a);
      setMastery(m);
      setReviewStats(r);
      setBlocks(b);
      setBottlenecks(bo);
      setXpEvolution(xp);
      setCompletionRates(cr);
      setLevelProgress(lp);
      setRank(await getRankForLevel(lp.level));
      setBibliography(bib);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  const totalBlocks = blocks ? blocks.comprension + blocks.aplicacion + blocks.consolidacion : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-10">
      <h1 className="font-display text-2xl">Estadísticas</h1>

      {reviewStats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <StatTile label="Repasos vencidos" value={reviewStats.vencidos} tone="danger" />
          <StatTile label="Próximos" value={reviewStats.proximos} tone="accent" />
          <StatTile label="Completados" value={reviewStats.completados} tone="success" />
          <StatTile label="Pospuestos" value={reviewStats.pospuestos} />
          <StatTile label="Innecesarios" value={reviewStats.innecesarios} />
          <StatTile label="Enfriados" value={reviewStats.enfriados} />
        </section>
      )}

      {levelProgress && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Nivel actual" value={levelProgress.level} tone="accent" />
          <div className="rounded border border-border-subtle bg-surface p-3">
            <p className="font-display text-2xl text-text-primary">{rank?.name ?? "—"}</p>
            <p className="mt-0.5 text-xs text-text-muted">Rango actual</p>
          </div>
          <StatTile label="XP total" value={Math.round(levelProgress.xpTotal)} />
          <StatTile label="% del nivel" value={Math.round(levelProgress.percentOfLevel)} />
        </section>
      )}

      {bibliography && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Biblioteca</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Total de obras" value={bibliography.totalResources} />
            <StatTile label="Con archivo local" value={bibliography.resourcesWithLocalFile} />
            <StatTile label="Con relaciones académicas" value={bibliography.resourcesWithRelations} tone="success" />
            <StatTile label="Sin relaciones" value={bibliography.resourcesWithoutRelations} />
            <StatTile label="Usadas en sesiones" value={bibliography.usedInSessions} tone="accent" />
            <StatTile label="Usadas en proyectos" value={bibliography.usedInProjects} />
          </div>
          {bibliography.topAuthors.length > 0 && (
            <ul className="mt-3 space-y-1 rounded border border-border-subtle bg-surface p-3 text-xs text-text-secondary">
              {bibliography.topAuthors.map((a) => (
                <li key={a.author} className="flex items-center justify-between">
                  <span>{a.author}</span>
                  <span className="text-text-muted">{a.count} obra(s)</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          XP ganado (últimos 30 días)
        </h2>
        <p className="text-xs text-text-muted">Ritmo real de experiencia — no confundir con tiempo estudiado.</p>
        <div className="mt-3 h-56 rounded border border-border-subtle bg-surface p-3">
          {xpEvolution.every((p) => p.amount === 0) ? (
            <p className="flex h-full items-center justify-center text-sm text-text-muted">
              Todavía no se otorgó XP en este período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={xpEvolution}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={11} />
                <YAxis stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDay(String(d))} />
                <Line type="monotone" dataKey="cumulative" stroke="#00D6C5" strokeWidth={2} dot={false} name="XP acumulado" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Temas completados por materia
        </h2>
        <p className="text-xs text-text-muted">Mismo dato que Carrera — un tema marcado ahí se refleja acá también.</p>
        <ul className="mt-3 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {completionRates.length === 0 && <li className="p-3 text-sm text-text-muted">Sin materias con temas todavía.</li>}
          {completionRates.map((c) => (
            <li key={c.subjectTitle} className="p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-primary">{c.subjectTitle}</span>
                <span className="text-xs text-text-muted">
                  {c.completedTopics}/{c.totalTopics} temas ({c.completionPct}%)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-accent" style={{ width: `${c.completionPct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Sesiones (últimos 14 días)
        </h2>
        <p className="text-xs text-text-muted">El tiempo estudiado es un dato secundario; esto mide continuidad.</p>
        <div className="mt-3 h-56 rounded border border-border-subtle bg-surface p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activity}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={11} />
              <YAxis stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(d) => formatDay(String(d))}
                cursor={{ fill: "#1C2228" }}
              />
              <Bar dataKey="formal" stackId="s" fill="#43D69A" name="Cerradas" />
              <Bar dataKey="cancelada" stackId="s" fill="#FF6B72" name="Canceladas" />
              <Bar dataKey="incompleta" stackId="s" fill="#E6B85C" name="Incompletas" />
              <Bar dataKey="en_curso" stackId="s" fill="#00D6C5" name="En curso" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Evolución del dominio
        </h2>
        <p className="text-xs text-text-muted">Promedio de nivel (0–5) de las evaluaciones registradas por día.</p>
        <div className="mt-3 h-56 rounded border border-border-subtle bg-surface p-3">
          {mastery.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-text-muted">
              Todavía no hay evaluaciones de dominio registradas.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mastery}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={11} />
                <YAxis domain={[0, 5]} stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDay(String(d))} />
                <Line type="monotone" dataKey="avgLevel" stroke="#16F1DD" strokeWidth={2} dot={{ r: 3 }} name="Nivel promedio" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Comprensión, aplicación y consolidación
        </h2>
        <p className="text-xs text-text-muted">Distribución de los bloques registrados durante las sesiones.</p>
        {totalBlocks === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Todavía no hay bloques registrados en ninguna sesión.</p>
        ) : (
          <div className="mt-3 flex h-6 overflow-hidden rounded border border-border-subtle">
            <div style={{ width: `${(blocks!.comprension / totalBlocks) * 100}%`, background: "#00D6C5" }} title={`Comprensión: ${blocks!.comprension}`} />
            <div style={{ width: `${(blocks!.aplicacion / totalBlocks) * 100}%`, background: "#16F1DD" }} title={`Aplicación: ${blocks!.aplicacion}`} />
            <div style={{ width: `${(blocks!.consolidacion / totalBlocks) * 100}%`, background: "#087F78" }} title={`Consolidación: ${blocks!.consolidacion}`} />
          </div>
        )}
        {totalBlocks > 0 && (
          <p className="mt-1 text-xs text-text-muted">
            Comprensión {blocks!.comprension} · Aplicación {blocks!.aplicacion} · Consolidación {blocks!.consolidacion}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Materias con menor cobertura evaluada
        </h2>
        <p className="text-xs text-text-muted">
          Proporción de temas cuya competencia ya tiene al menos una evaluación de dominio.
        </p>
        <ul className="mt-3 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {bottlenecks.length === 0 && <li className="p-3 text-sm text-text-muted">Sin materias con temas todavía.</li>}
          {bottlenecks.map((b) => (
            <li key={b.subjectTitle} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="text-text-primary">{b.subjectTitle}</span>
              <span className="text-xs text-text-muted">
                {b.evaluatedTopics}/{b.totalTopics} temas evaluados ({Math.round(b.coverage * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "danger" | "accent" | "success" }) {
  const color = tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : tone === "success" ? "text-success" : "text-text-primary";
  return (
    <div className="rounded border border-border-subtle bg-surface p-3">
      <p className={`font-display text-2xl ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}
