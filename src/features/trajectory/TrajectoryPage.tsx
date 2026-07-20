import { useEffect, useState } from "react";
import { useViewPreference } from "@/hooks/useViewPreference";
import { TRAJECTORY_VIEW_DEFAULTS, trajectoryViewPreferenceSchema } from "@/schemas/viewPreferences";
import { getLevelProgress, type LevelProgress } from "@/services/xp";
import { getRankForLevel, getNextRank, ensureDefaultRanks, RANK_NARRATIVE_DISCLAIMER } from "@/services/ranks";
import { computeIpa, ensureCurrentFormulaVersion } from "@/services/progress";
import { ensureDefaultRubrics } from "@/services/rubrics";
import type { AcademicRankRow } from "@/database/types";
import { SummaryTab } from "./tabs/SummaryTab";
import { TranscriptTab } from "./tabs/TranscriptTab";
import { GradingTab } from "./tabs/GradingTab";
import { ExperienceTab } from "./tabs/ExperienceTab";
import { RanksTab } from "./tabs/RanksTab";
import { SubjectsProgressTab } from "./tabs/SubjectsProgressTab";
import { AcademicSettingsTab } from "./tabs/AcademicSettingsTab";
import { AttributesTab } from "./tabs/AttributesTab";

type TabId = "resumen" | "expediente" | "calificaciones" | "experiencia" | "niveles" | "materias" | "atributos" | "configuracion";

const TABS: { id: TabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "expediente", label: "Expediente" },
  { id: "calificaciones", label: "Calificaciones" },
  { id: "experiencia", label: "Experiencia" },
  { id: "niveles", label: "Niveles y rangos" },
  { id: "materias", label: "Progreso de materias" },
  { id: "atributos", label: "Atributos" },
  { id: "configuracion", label: "Configuración académica" },
];

export function TrajectoryPage() {
  const [ready, setReady] = useState(false);
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference(
    "trajectory",
    trajectoryViewPreferenceSchema,
    TRAJECTORY_VIEW_DEFAULTS,
  );
  const tab = viewPrefs.tab as TabId;
  const [levelProgress, setLevelProgress] = useState<LevelProgress | null>(null);
  const [currentRank, setCurrentRank] = useState<AcademicRankRow | null>(null);
  const [nextRank, setNextRank] = useState<AcademicRankRow | null>(null);
  const [ipaTotal, setIpaTotal] = useState<number | null>(null);

  async function refreshHeader() {
    const progress = await getLevelProgress();
    setLevelProgress(progress);
    setCurrentRank(await getRankForLevel(progress.level));
    setNextRank(await getNextRank(progress.level));
    const ipa = await computeIpa({ kind: "career" });
    setIpaTotal(ipa.total);
  }

  useEffect(() => {
    void (async () => {
      await Promise.all([ensureDefaultRanks(), ensureDefaultRubrics(), ensureCurrentFormulaVersion()]);
      await refreshHeader();
      setReady(true);
    })();
  }, []);

  if (!ready || !levelProgress) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="mx-auto max-w-5xl p-10">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-border-subtle bg-surface p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Nivel {levelProgress.level}
            {currentRank && ` · ${currentRank.name}`}
          </p>
          {currentRank?.subtitle && <p className="mt-0.5 font-display text-lg text-text-primary">{currentRank.subtitle}</p>}
          <p className="mt-1 text-xs text-text-secondary">
            {Math.round(levelProgress.xpTotal).toLocaleString("es-AR")} /{" "}
            {levelProgress.xpForNextLevel != null ? Math.round(levelProgress.xpForNextLevel).toLocaleString("es-AR") : "100.000"} XP
          </p>
          <div className="mt-2 h-2 w-64 max-w-full overflow-hidden rounded bg-background">
            <div className="h-full bg-accent" style={{ width: `${levelProgress.percentOfLevel}%` }} />
          </div>
        </div>
        <div className="flex gap-6 text-right text-xs text-text-secondary">
          <div>
            <p className="text-text-muted">Próximo rango</p>
            <p className="mt-0.5 text-text-primary">{nextRank?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-text-muted">IPA total</p>
            <p className="mt-0.5 text-accent">{ipaTotal != null ? (ipaTotal * 100).toFixed(1) : "—"}%</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-text-muted">{RANK_NARRATIVE_DISCLAIMER}</p>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => updateViewPrefs({ tab: t.id }, { immediate: true })}
            className={`rounded-t px-3 py-2 text-xs uppercase tracking-wide ${
              tab === t.id ? "border-b-2 border-accent text-accent" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "resumen" && <SummaryTab levelProgress={levelProgress} currentRank={currentRank} />}
        {tab === "expediente" && <TranscriptTab />}
        {tab === "calificaciones" && <GradingTab onXpAwarded={refreshHeader} />}
        {tab === "experiencia" && <ExperienceTab />}
        {tab === "niveles" && <RanksTab currentLevel={levelProgress.level} onChanged={refreshHeader} />}
        {tab === "materias" && <SubjectsProgressTab />}
        {tab === "atributos" && <AttributesTab />}
        {tab === "configuracion" && <AcademicSettingsTab onChanged={refreshHeader} />}
      </div>
    </div>
  );
}
