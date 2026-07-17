import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { SodiacLogo } from "@/components/brand/SodiacLogo";
import { PomodoroSection } from "./PomodoroSection";
import { subjectsRepo } from "@/database/entities";
import { getSetting, setSetting } from "@/services/settings";
import {
  getAcademicProgress,
  getActivityHeatmap,
  getCareerOverview,
  getConfidenceVsLevel,
  getDashboardPrefs,
  getSummaryCounts,
  getSystemStatus,
  getUpcomingAgenda,
  resetDashboardPrefs,
  setDashboardPrefs,
  type AcademicProgress,
  type ActivityDay,
  type AgendaItem,
  type CareerOverview,
  type ConfidenceVsLevelPoint,
  type DashboardPrefs,
  type DashboardWidgetId,
  type SummaryCounts,
  type SystemStatus,
} from "@/services/dashboard";
import { getBlockDistribution, getSessionActivity, type BlockDistribution, type SessionActivityDay } from "@/services/statistics";
import { MASTERY_LEVEL_COLOR, MASTERY_LEVEL_LABEL } from "@/services/mastery";
import { getLevelProgress, type LevelProgress } from "@/services/xp";
import { getNextRank, getRankForLevel } from "@/services/ranks";
import { computeIpa } from "@/services/progress";
import type { AcademicRankRow } from "@/database/types";

const ONBOARDING_DISMISSED_KEY = "onboarding_dismissed";

const AXIS_COLOR = "#6F7980";
const GRID_COLOR = "#1D2328";
const TOOLTIP_STYLE = {
  background: "#171B20",
  border: "1px solid #293037",
  borderRadius: 6,
  fontSize: 12,
  color: "#F4F7F8",
};

const WIDGET_LABEL: Record<DashboardWidgetId, string> = {
  pomodoro: "Temporizador Pomodoro",
  trayectoria: "Trayectoria académica",
  resumen: "Resumen",
  heatmap: "Calendario de actividad",
  progreso: "Progreso académico",
  temporal: "Estadísticas temporales",
  sistema: "Estado del sistema",
  agenda: "Agenda general",
};

function formatDay(day: string): string {
  return new Date(day).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function relativeAgo(iso: string | null): string {
  if (!iso) return "sin registro";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<CareerOverview | null>(null);
  const [summary, setSummary] = useState<SummaryCounts | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityDay[]>([]);
  const [progress, setProgress] = useState<AcademicProgress | null>(null);
  const [activity, setActivity] = useState<SessionActivityDay[]>([]);
  const [blocks, setBlocks] = useState<BlockDistribution | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceVsLevelPoint[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [prefs, setPrefs] = useState<DashboardPrefs | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const refresh = useCallback(async (rangeDays: 30 | 90 | 365) => {
    const [ov, sum, hm, prog, act, blk, conf, sys, ag] = await Promise.all([
      getCareerOverview(),
      getSummaryCounts(),
      getActivityHeatmap(rangeDays),
      getAcademicProgress(),
      getSessionActivity(14),
      getBlockDistribution(),
      getConfidenceVsLevel(30),
      getSystemStatus(),
      getUpcomingAgenda(),
    ]);
    setOverview(ov);
    setSummary(sum);
    setHeatmap(hm);
    setProgress(prog);
    setActivity(act);
    setBlocks(blk);
    setConfidence(conf);
    setSystemStatus(sys);
    setAgenda(ag);
    setLoading(false);
  }, []);

  useEffect(() => {
    void getDashboardPrefs().then(async (p) => {
      setPrefs(p);
      await refresh(p.rangeDays);
    });
    void Promise.all([subjectsRepo.list(), getSetting<boolean>(ONBOARDING_DISMISSED_KEY)]).then(
      ([subjects, dismissed]) => setShowOnboarding(subjects.length === 0 && !dismissed),
    );
  }, [refresh]);

  async function handleDismissOnboarding() {
    setShowOnboarding(false);
    await setSetting(ONBOARDING_DISMISSED_KEY, true);
  }

  async function handleRangeChange(rangeDays: 30 | 90 | 365) {
    if (!prefs) return;
    const next = { ...prefs, rangeDays };
    setPrefs(next);
    await setDashboardPrefs(next);
    await refresh(rangeDays);
  }

  async function handleToggleWidget(id: DashboardWidgetId) {
    if (!prefs) return;
    const hidden = prefs.hidden.includes(id) ? prefs.hidden.filter((w) => w !== id) : [...prefs.hidden, id];
    const next = { ...prefs, hidden };
    setPrefs(next);
    await setDashboardPrefs(next);
  }

  async function handleMove(id: DashboardWidgetId, direction: -1 | 1) {
    if (!prefs) return;
    const order = [...prefs.order];
    const index = order.indexOf(id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    const next = { ...prefs, order };
    setPrefs(next);
    await setDashboardPrefs(next);
  }

  async function handleReset() {
    await resetDashboardPrefs();
    const p = await getDashboardPrefs();
    setPrefs(p);
    await refresh(p.rangeDays);
  }

  const visibleOrder = useMemo(
    () => (prefs ? prefs.order.filter((id) => !prefs.hidden.includes(id)) : []),
    [prefs],
  );

  if (loading || !prefs) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header
        className="relative isolate shrink-0 overflow-hidden border-b border-border-subtle px-10 py-[30px]"
        style={{
          minHeight: "170px",
          background:
            "radial-gradient(1200px 400px at 20% -20%, var(--atmosphere-blue), transparent), radial-gradient(900px 400px at 90% 10%, var(--atmosphere-purple), transparent), var(--background-deep)",
        }}
      >
        <SodiacLogo
          variant="symbol"
          size={64}
          decorative
          className="pointer-events-none absolute right-10 top-10 z-0 text-text-primary opacity-[0.08]"
        />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-text-muted">
            <SodiacLogo variant="symbol" size={14} decorative />
            SODIAC · TRAYECTORIA ACADÉMICA
          </div>
          <h1
            className="mt-2 font-display font-semibold text-text-primary"
            style={{ fontSize: "clamp(28px, 3vw, 46px)", lineHeight: 1.05 }}
          >
            {overview?.instituteName}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Carrera personal de aprendizaje, aplicación y producción de conocimiento.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
            <span>
              Etapa actual: <strong className="text-text-primary">{overview?.currentStageTitle ?? "sin datos"}</strong>
            </span>
            <span>
              Dominio agregado:{" "}
              <strong className="text-accent">
                {overview?.avgMasteryLevel != null ? overview.avgMasteryLevel.toFixed(1) : "—"} / 5
              </strong>
            </span>
            <span className="text-text-muted">
              Cobertura: {overview ? Math.round(overview.coverage * 100) : 0}% ({overview?.evaluatedTopics}/
              {overview?.totalTopics} temas)
            </span>
          </div>
        </div>
      </header>

      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-10 py-3">
        <div className="flex gap-2 text-xs">
          {([30, 90, 365] as const).map((r) => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              className={`rounded border px-2 py-1 uppercase tracking-wide ${
                prefs.rangeDays === r ? "border-accent text-accent" : "border-border text-text-secondary"
              }`}
            >
              {r} días
            </button>
          ))}
        </div>
        <button
          onClick={() => setCustomizing((s) => !s)}
          className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
        >
          {customizing ? "Listo" : "Personalizar"}
        </button>
      </div>

      {customizing && (
        <div className="border-b border-border-subtle bg-surface px-10 py-4">
          <ul className="space-y-2">
            {prefs.order.map((id, i) => (
              <li key={id} className="flex items-center gap-3 text-sm">
                <span className="w-48 text-text-primary">{WIDGET_LABEL[id]}</span>
                <button onClick={() => handleMove(id, -1)} disabled={i === 0} className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary disabled:opacity-30">
                  ↑
                </button>
                <button onClick={() => handleMove(id, 1)} disabled={i === prefs.order.length - 1} className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary disabled:opacity-30">
                  ↓
                </button>
                <button
                  onClick={() => handleToggleWidget(id)}
                  className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
                >
                  {prefs.hidden.includes(id) ? "Mostrar" : "Ocultar"}
                </button>
              </li>
            ))}
          </ul>
          <button onClick={handleReset} className="mt-3 text-xs uppercase tracking-wide text-text-muted hover:text-danger">
            Restablecer distribución predeterminada
          </button>
        </div>
      )}

      {showOnboarding && (
        <div className="border-b border-border-subtle px-10 py-4">
          <section className="flex items-start justify-between gap-4 rounded border border-accent/40 bg-accent/5 p-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">Empezá por acá</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Todavía no importaste la estructura académica institucional (preguntas, materias, temas).
                Andá a <Link to="/configuracion" className="text-accent underline">Configuración</Link> y usá
                "Importar estructura institucional" para empezar.
              </p>
            </div>
            <button
              onClick={handleDismissOnboarding}
              aria-label="Descartar aviso de bienvenida"
              className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
            >
              Descartar
            </button>
          </section>
        </div>
      )}

      <div className="space-y-10 p-10">
        {visibleOrder.map((id) => {
          switch (id) {
            case "pomodoro":
              return <PomodoroSection key={id} />;
            case "trayectoria":
              return <TrayectoriaSection key={id} />;
            case "resumen":
              return summary && <SummarySection key={id} summary={summary} />;
            case "heatmap":
              return <HeatmapSection key={id} days={heatmap} rangeDays={prefs.rangeDays} />;
            case "progreso":
              return progress && <ProgressSection key={id} progress={progress} />;
            case "temporal":
              return <TemporalSection key={id} activity={activity} blocks={blocks} confidence={confidence} />;
            case "sistema":
              return systemStatus && <SystemStatusSection key={id} status={systemStatus} />;
            case "agenda":
              return <AgendaSection key={id} items={agenda} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border-subtle bg-surface p-3">
      <p className="font-display text-2xl text-text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}

function SummarySection({ summary }: { summary: SummaryCounts }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Resumen</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Tile label="Sesiones esta semana" value={summary.sessionsThisWeek} />
        <Tile label="Sesiones este mes" value={summary.sessionsThisMonth} />
        <Tile label="Días activos (semana)" value={summary.activeDaysThisWeek} />
        <Tile label="Días activos (mes)" value={summary.activeDaysThisMonth} />
        <Tile label="Minutos esta semana" value={summary.studyMinutesThisWeek} />
        <Tile label="Evidencias producidas" value={summary.evidencesProduced} />
        <Tile label="Repasos realizados" value={summary.reviewsCompleted} />
        <Tile label="Repasos pendientes" value={summary.reviewsPending} />
        <Tile label="Proyectos activos" value={summary.activeProjects} />
        <Tile label="Notas en Obsidian" value={summary.obsidianNotesIndexed} />
        <Tile label="Recursos bibliográficos" value={summary.activeLibraryResources} />
        <Tile label="Materias activas" value={summary.activeSubjects} />
      </div>
    </section>
  );
}

const HEATMAP_COLOR = ["#12161A", "#0E3B36", "#087F78", "#00D6C5", "#43D69A"];

function heatmapLevel(day: ActivityDay): number {
  const total = day.estudio + day.aplicacion + day.produccion + day.repaso + day.proyecto;
  if (total === 0) return 0;
  if (total <= 1) return 1;
  if (total <= 2) return 2;
  if (total <= 4) return 3;
  return 4;
}

function HeatmapSection({ days, rangeDays }: { days: ActivityDay[]; rangeDays: number }) {
  const weeks: ActivityDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
        Calendario de actividad ({rangeDays} días)
      </h2>
      <p className="text-xs text-text-muted">Estudio · Aplicación · Producción · Repaso · Proyecto.</p>
      <div className="mt-3 flex gap-1 overflow-x-auto rounded border border-border-subtle bg-surface p-3">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.day}
                title={`${formatDay(day.day)} · ${day.estudio + day.aplicacion + day.produccion + day.repaso + day.proyecto} sesiones · ${day.minutes} min`}
                className="h-3 w-3 rounded-sm"
                style={{ background: HEATMAP_COLOR[heatmapLevel(day)] }}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProgressSection({ progress }: { progress: AcademicProgress }) {
  const distributionEntries = Object.entries(progress.masteryDistribution).map(([level, count]) => ({
    level: Number(level),
    count,
  }));
  const maxCount = Math.max(1, ...distributionEntries.map((d) => d.count));

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Progreso académico</h2>

      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        <ProgressBucketList title="Por etapa" buckets={progress.byStage} />
        <ProgressBucketList title="Por pregunta fundamental" buckets={progress.byQuestion} />
        <ProgressBucketList title="Por materia" buckets={progress.bySubject} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Distribución de niveles de dominio</h3>
          <div className="mt-2 space-y-1.5 rounded border border-border-subtle bg-surface p-3">
            {distributionEntries.map((d) => (
              <div key={d.level} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 text-text-secondary">{MASTERY_LEVEL_LABEL[d.level]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-background">
                  <div
                    className="h-full"
                    style={{ width: `${(d.count / maxCount) * 100}%`, background: MASTERY_LEVEL_COLOR[d.level] }}
                  />
                </div>
                <span className="w-6 text-right text-text-muted">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Señales de atención</h3>
          <ul className="mt-2 space-y-1.5 rounded border border-border-subtle bg-surface p-3 text-xs text-text-secondary">
            <li>Temas sin evidencia de dominio: <strong className="text-text-primary">{progress.topicsWithoutEvidence}</strong></li>
            <li>Temas enfriados: <strong className="text-text-primary">{progress.topicsCooled}</strong></li>
            <li>Temas con repaso pendiente: <strong className="text-text-primary">{progress.topicsPendingReview}</strong></li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function ProgressBucketList({ title, buckets }: { title: string; buckets: AcademicProgress["byStage"] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className="mt-2 space-y-1.5 rounded border border-border-subtle bg-surface p-3">
        {buckets.length === 0 && <li className="text-xs text-text-muted">Sin datos todavía.</li>}
        {buckets.map((b) => (
          <li key={b.id} className="text-xs">
            <div className="flex items-center justify-between">
              <span className="text-text-primary">{b.title}</span>
              <span className="text-text-muted">
                {b.evaluatedTopics}/{b.totalTopics} · {Math.round(b.coverage * 100)}%
                {b.avgLevel != null && ` · dominio ${b.avgLevel.toFixed(1)}`}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-background">
              <div className="h-full bg-accent" style={{ width: `${b.coverage * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemporalSection({
  activity,
  blocks,
  confidence,
}: {
  activity: SessionActivityDay[];
  blocks: BlockDistribution | null;
  confidence: ConfidenceVsLevelPoint[];
}) {
  const totalBlocks = blocks ? blocks.comprension + blocks.aplicacion + blocks.consolidacion : 0;
  const confidenceData = confidence.map((c, i) => ({ index: i, ...c }));

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Estadísticas temporales</h2>

      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sesiones por día (14 días)</h3>
          <div className="mt-2 h-48 rounded border border-border-subtle bg-surface p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={11} />
                <YAxis stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDay(String(d))} cursor={{ fill: "#1C2228" }} />
                <Bar dataKey="formal" stackId="s" fill="#43D69A" name="Cerradas" />
                <Bar dataKey="incompleta" stackId="s" fill="#E6B85C" name="Incompletas" />
                <Bar dataKey="cancelada" stackId="s" fill="#FF6B72" name="Canceladas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Confianza declarada frente a nivel evaluado
          </h3>
          <div className="mt-2 h-48 rounded border border-border-subtle bg-surface p-3">
            {confidenceData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-text-muted">Sin evaluaciones todavía.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid stroke={GRID_COLOR} />
                  <XAxis dataKey="index" name="Evaluación" stroke={AXIS_COLOR} fontSize={11} tick={false} />
                  <YAxis dataKey="level" name="Nivel" domain={[0, 5]} stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                  <ZAxis dataKey="declaredConfidence" range={[30, 200]} name="Confianza declarada" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, name) => [value, name]}
                    labelFormatter={() => ""}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Scatter name="Nivel evaluado (tamaño = confianza declarada)" data={confidenceData} fill="#16F1DD" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Comprensión, aplicación y consolidación
        </h3>
        {totalBlocks === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Todavía no hay bloques registrados.</p>
        ) : (
          <div className="mt-2 flex h-5 overflow-hidden rounded border border-border-subtle">
            <div style={{ width: `${(blocks!.comprension / totalBlocks) * 100}%`, background: "#00D6C5" }} title={`Comprensión: ${blocks!.comprension}`} />
            <div style={{ width: `${(blocks!.aplicacion / totalBlocks) * 100}%`, background: "#16F1DD" }} title={`Aplicación: ${blocks!.aplicacion}`} />
            <div style={{ width: `${(blocks!.consolidacion / totalBlocks) * 100}%`, background: "#087F78" }} title={`Consolidación: ${blocks!.consolidacion}`} />
          </div>
        )}
      </div>
    </section>
  );
}

function TrayectoriaSection() {
  const [level, setLevel] = useState<LevelProgress | null>(null);
  const [rank, setRank] = useState<AcademicRankRow | null>(null);
  const [nextRank, setNextRank] = useState<AcademicRankRow | null>(null);
  const [ipa, setIpa] = useState<number | null>(null);

  useEffect(() => {
    void getLevelProgress().then(async (lp) => {
      setLevel(lp);
      const [r, nr, ipaResult] = await Promise.all([
        getRankForLevel(lp.level),
        getNextRank(lp.level),
        computeIpa({ kind: "career" }),
      ]);
      setRank(r);
      setNextRank(nr);
      setIpa(ipaResult.total);
    });
  }, []);

  if (!level) return null;

  return (
    <section className="rounded border border-border-subtle bg-gradient-to-br from-surface to-surface-elevated p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Nivel {level.level}</p>
          <h2 className="mt-1 font-display text-xl text-accent">{rank?.name ?? "Sin rango"}</h2>
          {rank?.subtitle && <p className="text-xs text-text-secondary">{rank.subtitle}</p>}
        </div>
        <div className="flex gap-6 text-right text-xs text-text-muted">
          {ipa != null && (
            <div>
              <p className="text-text-muted">IPA</p>
              <p className="font-display text-lg text-text-primary">{(ipa * 100).toFixed(1)}%</p>
            </div>
          )}
          {nextRank && (
            <div>
              <p className="text-text-muted">Próximo rango</p>
              <p className="text-text-primary">{nextRank.name}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full bg-accent" style={{ width: `${level.percentOfLevel}%` }} />
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {Math.round(level.xpIntoLevel).toLocaleString("es-AR")} XP
        {level.xpForNextLevel != null && ` de ${Math.round(level.xpForNextLevel - level.xpForCurrentLevel).toLocaleString("es-AR")}`}
        {level.xpNeededForNextLevel != null &&
          ` · faltan ${Math.round(level.xpNeededForNextLevel).toLocaleString("es-AR")} XP para el nivel ${level.level + 1}`}
      </p>

      <div className="mt-4 flex gap-3">
        <Link to="/trajectory" className="rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent hover:bg-accent/10">
          Ver trayectoria
        </Link>
        <Link to="/carrera" className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent">
          Ver carrera
        </Link>
      </div>
    </section>
  );
}

function SystemStatusSection({ status }: { status: SystemStatus }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Estado del sistema</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Última sesión cerrada" value={relativeAgo(status.lastClosedSessionAt)} />
        <Tile label="Última nota indexada" value={relativeAgo(status.lastNoteCreatedAt)} />
        <Tile label="Última sincronización Obsidian" value={relativeAgo(status.lastObsidianSyncAt)} />
        <Tile label="Último backup" value={relativeAgo(status.lastBackupAt)} />
        <Tile label="Documentos institucionales" value={status.documentsCount} />
        <Tile label="Recursos de biblioteca" value={status.libraryResourcesCount} />
      </div>
      {status.alerts.length > 0 && (
        <ul className="mt-3 space-y-1 rounded border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          {status.alerts.map((a) => (
            <li key={a}>· {a}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

const AGENDA_LABEL: Record<AgendaItem["kind"], string> = {
  repaso: "Repaso",
  hito: "Hito de proyecto",
  sesion: "Sesión programada",
  proyecto: "Proyecto",
};

function AgendaSection({ items }: { items: AgendaItem[] }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Agenda general (próximos 7 días)
        </h2>
        <Link to="/sesiones" className="text-xs text-accent hover:underline">
          Ver sesiones →
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
        {items.length === 0 && <li className="p-3 text-sm text-text-muted">Nada agendado para los próximos 7 días.</li>}
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span className="text-text-primary">{item.label}</span>
            <span className="text-xs text-text-muted">
              {AGENDA_LABEL[item.kind]} · {formatDateTime(item.date)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
