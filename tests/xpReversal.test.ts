import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

// Vite no resuelve `node:sqlite` como builtin (es reciente), así que se carga
// en runtime para saltear su análisis estático.
interface Stmt { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): unknown }
interface Sqlite { exec(sql: string): void; prepare(sql: string): Stmt; close(): void }
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => Sqlite;
};

/**
 * Estos tests corren contra SQLite real (`node:sqlite`), no contra un repo en
 * memoria. La razón: lo que se está probando es la semántica SQL de la búsqueda
 * por familia de claves de idempotencia — `LIKE ? ESCAPE '\'` con categorías que
 * contienen `_`, que es un comodín. Un mock que hiciera `startsWith` daría verde
 * con un bug real.
 */
let db: Sqlite;

const SCHEMA = `
CREATE TABLE xp_event (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  subject_id TEXT,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  score INTEGER,
  multiplier REAL,
  rubric_version_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  reversal_of TEXT REFERENCES xp_event(id),
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  xp_rules_version_id TEXT
);
CREATE TABLE subject (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, credits INTEGER NOT NULL DEFAULT 3,
  complexity INTEGER NOT NULL DEFAULT 3, importance INTEGER NOT NULL DEFAULT 3,
  estimated_load INTEGER NOT NULL DEFAULT 3, is_mandatory INTEGER NOT NULL DEFAULT 1,
  budgeted_xp REAL, completion_budgeted_xp REAL, completed_at TEXT, archived_at TEXT,
  status TEXT NOT NULL DEFAULT 'activa', updated_at TEXT
);
CREATE TABLE academic_level_history (
  id TEXT PRIMARY KEY, level INTEGER NOT NULL, xp_total_at REAL NOT NULL, reached_at TEXT NOT NULL
);
CREATE TABLE xp_rules_version (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, career_total_xp REAL NOT NULL, max_level INTEGER NOT NULL,
  level_curve_exponent REAL NOT NULL, graded_share REAL NOT NULL, completion_share REAL NOT NULL,
  category_weights_json TEXT NOT NULL, completion_category_weights_json TEXT NOT NULL,
  frozen_at_level INTEGER, frozen_at_xp REAL, is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', notes TEXT
);
CREATE TABLE activity_log (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL,
  payload_json TEXT, actor TEXT NOT NULL DEFAULT 'usuario', created_at TEXT NOT NULL DEFAULT ''
);
`;

// `getDb` real reemplazado por el SQLite en memoria; el resto de la cadena
// (repository.ts, entities, xp.ts) corre sin modificar.
vi.mock("@/database/client", () => ({
  getDb: async () => ({
    async select<T>(sql: string, params: unknown[] = []): Promise<T> {
      return db.prepare(sql).all(...(params as never[])) as T;
    },
    async execute(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...(params as never[]));
      return { rowsAffected: 1, lastInsertId: 0 };
    },
  }),
}));

const { awardXp, reverseXp, listXpEventsForCompletion, baseIdempotencyKey, getCareerXpTotal, pruneLevelHistoryAboveCurrent } =
  await import("@/services/xp");

const SUBJECT_ID = "subj-1";
const TOPIC_ID = "e7f3a1b2-0000-4000-8000-000000000001";

function completionInput() {
  return {
    sourceType: "topic_completion",
    sourceId: TOPIC_ID,
    subjectId: SUBJECT_ID,
    category: "finalizacion_tema" as const,
    score100: 100,
    reason: "Tema finalizado",
  };
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare(
    `INSERT INTO xp_rules_version (id,label,career_total_xp,max_level,level_curve_exponent,graded_share,
      completion_share,category_weights_json,completion_category_weights_json,is_current)
     VALUES ('r1','test',112600,100,2,0.6,0.4,?,?,1)`,
  ).run(
    JSON.stringify({
      notas_conceptuales: 0.2, ejercicios_practicas: 0.25, aplicaciones_casos: 0.2,
      proyecto_examen_integrador: 0.2, hitos_dominio: 0.1, revision_diferida_retencion: 0.05, intento: 0,
    }),
    JSON.stringify({ finalizacion_tarea_hito: 0.3, finalizacion_tema: 0.4, cierre_materia: 0.2, validacion_conocimiento: 0.1 }),
  );
  db.prepare(`INSERT INTO subject (id,title) VALUES (?, 'Materia de prueba')`).run(SUBJECT_ID);
});

describe("clave de idempotencia por familia", () => {
  it("la clave base tiene la forma documentada", () => {
    expect(baseIdempotencyKey("topic_completion", TOPIC_ID, "finalizacion_tema")).toBe(
      `topic_completion:${TOPIC_ID}:finalizacion_tema:sin_rubrica`,
    );
  });

  it("la familia NO matchea otra clave que sólo difiere donde hay guion bajo", async () => {
    // `finalizacion_tema` contiene `_`, que es comodín de LIKE. Sin ESCAPE,
    // `finalizacion_tema` matchearía `finalizacionXtema` y sumaría XP ajeno.
    const base = baseIdempotencyKey("topic_completion", TOPIC_ID, "finalizacion_tema");
    const impostor = base.replace("finalizacion_tema", "finalizacionXtema");
    db.prepare(
      `INSERT INTO xp_event (id,date,amount,source_type,source_id,category,reason,idempotency_key,created_at)
       VALUES ('impostor','', 999, 'topic_completion', ?, 'finalizacion_tema', 'ajeno', ?, '')`,
    ).run(TOPIC_ID, `${impostor}:rev1`);

    const family = await listXpEventsForCompletion("topic_completion", TOPIC_ID, "finalizacion_tema");
    expect(family.map((e) => e.id)).not.toContain("impostor");
  });
});

describe("ciclo completar → revertir → re-completar", () => {
  it("otorga XP la primera vez", async () => {
    const result = await awardXp(completionInput());
    expect(result.event).not.toBeNull();
    expect(result.awardedAmount).toBeGreaterThan(0);
    expect(result.event!.idempotency_key).toBe(baseIdempotencyKey("topic_completion", TOPIC_ID, "finalizacion_tema"));
  });

  it("no vuelve a otorgar si se completa dos veces sin revertir", async () => {
    await awardXp(completionInput());
    const second = await awardXp(completionInput());
    expect(second.event).toBeNull();
    expect(second.awardedAmount).toBe(0);
  });

  it("la reversión netea el XP a cero sin borrar el evento original", async () => {
    const first = await awardXp(completionInput());
    const original = first.event!;
    const totalTrasOtorgar = await getCareerXpTotal();
    expect(totalTrasOtorgar).toBeCloseTo(original.amount, 2);

    await reverseXp(original, "Revertido: sesión de prueba", { reasonCode: "sesion_prueba" });

    expect(await getCareerXpTotal()).toBeCloseTo(0, 2);
    // El original sigue existiendo, intacto.
    const still = db.prepare("SELECT * FROM xp_event WHERE id = ?").get(original.id) as { amount: number };
    expect(still.amount).toBeCloseTo(original.amount, 2);
    // Y hay exactamente dos eventos: el original y el compensatorio.
    const family = await listXpEventsForCompletion("topic_completion", TOPIC_ID, "finalizacion_tema");
    expect(family).toHaveLength(2);
    expect(family.filter((e) => e.reversal_of === original.id)).toHaveLength(1);
  });

  it("tras revertir se puede volver a completar y el XP se otorga otra vez, una sola vez", async () => {
    const first = await awardXp(completionInput());
    const monto = first.event!.amount;
    await reverseXp(first.event!, "Revertido");

    const again = await awardXp(completionInput());
    expect(again.event).not.toBeNull();
    expect(again.awardedAmount).toBeCloseTo(monto, 2);
    // Clave nueva, distinta de la original — el UNIQUE no se viola.
    expect(again.event!.idempotency_key).not.toBe(first.event!.idempotency_key);
    expect(await getCareerXpTotal()).toBeCloseTo(monto, 2);

    // Y un tercer intento sin revertir no otorga nada.
    const third = await awardXp(completionInput());
    expect(third.event).toBeNull();
    expect(await getCareerXpTotal()).toBeCloseTo(monto, 2);
  });

  it("una segunda reversión del mismo evento la bloquea el UNIQUE", async () => {
    const first = await awardXp(completionInput());
    await reverseXp(first.event!, "Revertido");
    await expect(reverseXp(first.event!, "Revertido de nuevo")).rejects.toThrow();
    // El XP sigue neteado a cero, no en negativo.
    expect(await getCareerXpTotal()).toBeCloseTo(0, 2);
  });

  it("el ciclo completo se puede repetir varias veces sin colisión de claves", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await awardXp(completionInput());
      expect(r.event, `ciclo ${i}: debería otorgar`).not.toBeNull();
      await reverseXp(r.event!, `Revertido ciclo ${i}`);
      expect(await getCareerXpTotal()).toBeCloseTo(0, 2);
    }
    const family = await listXpEventsForCompletion("topic_completion", TOPIC_ID, "finalizacion_tema");
    expect(family).toHaveLength(6);
    expect(new Set(family.map((e) => e.idempotency_key)).size).toBe(6);
  });
});

describe("purga de academic_level_history", () => {
  it("borra sólo las filas por encima del nivel real", async () => {
    for (const level of [0, 1, 2, 5, 9]) {
      db.prepare("INSERT INTO academic_level_history (id,level,xp_total_at,reached_at) VALUES (?,?,0,'')")
        .run(`h${level}`, level);
    }
    // Sin XP el nivel resultante es 0, así que todo lo de arriba miente.
    const purged = await pruneLevelHistoryAboveCurrent();
    expect(purged).toBe(4);
    const left = db.prepare("SELECT level FROM academic_level_history ORDER BY level").all() as { level: number }[];
    expect(left.map((r) => r.level)).toEqual([0]);
  });

  it("no borra nada si no hay filas por encima", async () => {
    db.prepare("INSERT INTO academic_level_history (id,level,xp_total_at,reached_at) VALUES ('h0',0,0,'')").run();
    expect(await pruneLevelHistoryAboveCurrent()).toBe(0);
  });
});
