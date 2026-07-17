import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { useViewPreference } from "@/hooks/useViewPreference";
import { MAP_VIEW_DEFAULTS, mapViewPreferenceSchema } from "@/schemas/viewPreferences";
import { layoutHorizontal } from "./mapLayout";
import { OPTIONAL_RENDERED_TYPES, RENDERED_TYPES, TYPE_COLOR, TYPE_LABEL, type MapEntityType } from "./mapTypeColors";
import { EntityDetailPanel, type SelectedEntity } from "./EntityDetailPanel";
import type { CurriculumData } from "./useCurriculumData";

interface NodeData {
  label: string;
  entityType: MapEntityType;
}

function nodeStyle(type: MapEntityType, dimmed: boolean, highlighted: boolean): CSSProperties {
  const color = TYPE_COLOR[type];
  return {
    background: "#111418",
    border: `1.5px solid ${color}`,
    borderRadius: 6,
    color: "#F4F7F8",
    fontSize: 12,
    padding: "6px 10px",
    width: 240,
    // Fuerza una sola línea: mapLayout.ts le declara a dagre una altura fija
    // (NODE_HEIGHT) para calcular el espaciado vertical entre nodos del mismo
    // rango — si el título envolvía a una segunda línea, la altura real
    // renderizada superaba esa estimación y el nodo se solapaba con el de
    // abajo. El título completo sigue disponible al hacer clic (panel de
    // detalle).
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    opacity: dimmed ? 0.25 : 1,
    boxShadow: highlighted ? `0 0 0 2px ${color}` : "none",
  };
}

/**
 * Recorta el dataset a una sola materia y lo que cuelga de ella (su
 * pregunta fundamental primaria, sus temas/unidades, y las competencias
 * referenciadas por esos temas) — usado por el filtro "Enfocar una
 * materia" para dar una vista chica y navegable en vez del grafo completo.
 * No es un cálculo de conectividad genérico: sigue exactamente las mismas
 * relaciones jerárquicas que ya dibuja buildGraph, para no dejar huérfanos
 * ni traer de más (p. ej. otras materias que comparten la misma pregunta).
 */
function filterDataForFocus(data: CurriculumData, focusSubjectId: string | null): CurriculumData {
  if (!focusSubjectId) return data;
  const subject = data.subjects.find((s) => s.id === focusSubjectId);
  if (!subject) return data;
  const topics = data.topics.filter((t) => t.subject_id === focusSubjectId);
  const units = data.units.filter((u) => u.subject_id === focusSubjectId);
  const competencyIds = new Set(topics.map((t) => t.competency_id).filter((id): id is string => !!id));
  const competencies = data.competencies.filter((c) => competencyIds.has(c.id));
  const questions = data.questions.filter((q) => q.id === subject.fundamental_question_id);
  const projects = data.projects.filter((p) => p.subject_id === focusSubjectId);
  return { ...data, questions, competencies, subjects: [subject], units, topics, projects };
}

function buildGraph(
  data: CurriculumData,
  hiddenTypes: Set<MapEntityType>,
  expandedSubjects: Set<string>,
  showNotes: boolean,
) {
  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];

  const addNode = (id: string, entityType: MapEntityType, label: string) => {
    if (hiddenTypes.has(entityType)) return;
    nodes.push({ id, position: { x: 0, y: 0 }, data: { label, entityType }, style: nodeStyle(entityType, false, false) });
  };
  const addEdge = (source: string, target: string) => {
    edges.push({ id: `${source}->${target}`, source, target, type: "smoothstep", style: { stroke: "#293037" } });
  };

  for (const q of data.questions) addNode(q.id, "fundamental_question", q.title);
  for (const c of data.competencies) {
    addNode(c.id, "competency", c.title);
    if (c.fundamental_question_id) addEdge(c.fundamental_question_id, c.id);
  }
  for (const s of data.subjects) {
    addNode(s.id, "subject", s.title);
    addEdge(s.fundamental_question_id, s.id);
  }
  for (const p of data.projects) {
    addNode(p.id, "project", p.title);
    if (p.subject_id) addEdge(p.subject_id, p.id);
    else if (p.competency_id) addEdge(p.competency_id, p.id);
    else if (p.fundamental_question_id) addEdge(p.fundamental_question_id, p.id);
  }

  for (const s of data.subjects) {
    if (!expandedSubjects.has(s.id)) continue;
    for (const u of data.units.filter((x) => x.subject_id === s.id)) {
      addNode(u.id, "curriculum_unit", u.title);
      addEdge(s.id, u.id);
    }
  }

  const renderedTopicIds = new Set<string>();
  for (const t of data.topics) {
    if (!expandedSubjects.has(t.subject_id)) continue;
    addNode(t.id, "topic", t.title);
    renderedTopicIds.add(t.id);
    if (t.curriculum_unit_id) addEdge(t.curriculum_unit_id, t.id);
    else addEdge(t.subject_id, t.id);
    if (t.competency_id) addEdge(t.competency_id, t.id);
  }

  if (showNotes && !hiddenTypes.has("obsidian_note")) {
    for (const note of data.notes) {
      if (!note.sodiac_id || !renderedTopicIds.has(note.sodiac_id)) continue;
      addNode(note.id, "obsidian_note", note.title ?? note.vault_relative_path);
      addEdge(note.sodiac_id, note.id);
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  return { nodes, edges: validEdges };
}

/**
 * Panel de completitud (H6, ampliado en Fase L con datos reales tras la
 * reconciliación de la Fase J): a partir de los mismos datos ya cargados
 * por useCurriculumData, sin consultas nuevas.
 */
function computeCompleteness(data: CurriculumData) {
  const topicsWithoutUnit = data.topics.filter((t) => !t.curriculum_unit_id).length;
  const topicsWithoutCompetency = data.topics.filter((t) => !t.competency_id).length;
  const subjectsWithoutQuestion = data.subjects.filter((s) => !s.fundamental_question_id).length;
  const counts: Record<MapEntityType, number> = {
    fundamental_question: data.questions.length,
    competency: data.competencies.length,
    subject: data.subjects.length,
    curriculum_unit: data.units.length,
    topic: data.topics.length,
    project: data.projects.length,
    obsidian_note: data.notes.length,
    resource: 0,
  };
  return {
    counts,
    alerts: [
      topicsWithoutUnit > 0 ? `${topicsWithoutUnit} tema(s) sin unidad curricular` : null,
      topicsWithoutCompetency > 0 ? `${topicsWithoutCompetency} tema(s) sin competencia` : null,
      subjectsWithoutQuestion > 0 ? `${subjectsWithoutQuestion} materia(s) sin pregunta fundamental` : null,
    ].filter((x): x is string => x !== null),
  };
}

export function RelationsView({ data }: { data: CurriculumData }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Clave propia ("map-relations") — CurriculumPage ya usa "map" para su
  // propio selector árbol/tabla/mapa, y compartir la clave arriesgaría que
  // el flush de una vista pise el campo de la otra al desmontar.
  const { value: viewPrefs, update: updateViewPrefs } = useViewPreference(
    "map-relations",
    mapViewPreferenceSchema,
    MAP_VIEW_DEFAULTS,
  );
  const hiddenTypes = useMemo(() => new Set(viewPrefs.hiddenTypes) as Set<MapEntityType>, [viewPrefs.hiddenTypes]);
  const expandedSubjects = useMemo(() => new Set(viewPrefs.expandedSubjectIds), [viewPrefs.expandedSubjectIds]);
  const { showNotes, focusSubjectId, showLegend, showCompleteness } = viewPrefs;
  function setHiddenTypes(next: Set<MapEntityType> | ((prev: Set<MapEntityType>) => Set<MapEntityType>)) {
    const resolved = typeof next === "function" ? next(hiddenTypes) : next;
    updateViewPrefs({ hiddenTypes: Array.from(resolved) }, { immediate: true });
  }
  function setExpandedSubjects(next: Set<string> | ((prev: Set<string>) => Set<string>)) {
    const resolved = typeof next === "function" ? next(expandedSubjects) : next;
    updateViewPrefs({ expandedSubjectIds: Array.from(resolved) }, { immediate: true });
  }
  function setShowNotes(value: boolean) {
    updateViewPrefs({ showNotes: value }, { immediate: true });
  }
  function setFocusSubjectId(value: string | null) {
    updateViewPrefs({ focusSubjectId: value }, { immediate: true });
  }
  function setShowLegend(next: boolean | ((prev: boolean) => boolean)) {
    const resolved = typeof next === "function" ? next(showLegend) : next;
    updateViewPrefs({ showLegend: resolved }, { immediate: true });
  }
  function setShowCompleteness(next: boolean | ((prev: boolean) => boolean)) {
    const resolved = typeof next === "function" ? next(showCompleteness) : next;
    updateViewPrefs({ showCompleteness: resolved }, { immediate: true });
  }
  const [search, setSearch] = useState(searchParams.get("buscar") ?? "");
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  const completeness = useMemo(() => computeCompleteness(data), [data]);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const searchLower = search.trim().toLowerCase();

  // Búsqueda sobre el dataset COMPLETO (492 temas), no solo lo expandido —
  // si un tema coincide y su materia está colapsada, se expande sola.
  const fullMatches = useMemo(() => {
    if (!searchLower) return [];
    const results: { id: string; type: MapEntityType; subjectId?: string }[] = [];
    for (const q of data.questions) if (q.title.toLowerCase().includes(searchLower)) results.push({ id: q.id, type: "fundamental_question" });
    for (const c of data.competencies) if (c.title.toLowerCase().includes(searchLower)) results.push({ id: c.id, type: "competency" });
    for (const s of data.subjects) if (s.title.toLowerCase().includes(searchLower)) results.push({ id: s.id, type: "subject" });
    for (const t of data.topics)
      if (t.title.toLowerCase().includes(searchLower)) results.push({ id: t.id, type: "topic", subjectId: t.subject_id });
    return results;
  }, [data, searchLower]);

  useEffect(() => {
    if (fullMatches.length === 0) return;
    const subjectsToExpand = fullMatches.map((m) => m.subjectId).filter((id): id is string => !!id);
    if (subjectsToExpand.length === 0) return;
    setExpandedSubjects((prev) => {
      const missing = subjectsToExpand.filter((id) => !prev.has(id));
      if (missing.length === 0) return prev;
      const next = new Set(prev);
      for (const id of missing) next.add(id);
      return next;
    });
  }, [fullMatches]);

  // Si se llega desde el Cronograma Maestro con ?buscar=, prefill una sola vez.
  useEffect(() => {
    const initial = searchParams.get("buscar");
    if (initial) setSearch(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusedData = useMemo(() => filterDataForFocus(data, focusSubjectId), [data, focusSubjectId]);
  // En foco, la materia siempre se muestra expandida (para eso es el foco) sin
  // depender del estado general de expandedSubjects.
  const effectiveExpanded = useMemo(
    () => (focusSubjectId ? new Set([focusSubjectId]) : expandedSubjects),
    [focusSubjectId, expandedSubjects],
  );
  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildGraph(focusedData, hiddenTypes, effectiveExpanded, showNotes),
    [focusedData, hiddenTypes, effectiveExpanded, showNotes],
  );
  const positioned = useMemo(() => layoutHorizontal(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const matchingIds = useMemo(
    () => (searchLower ? new Set(fullMatches.map((m) => m.id)) : null),
    [fullMatches, searchLower],
  );

  // Reencuadra la vista cada vez que cambia el conjunto de nodos visibles:
  // con una búsqueda activa, sobre los resultados; si no, sobre todo el
  // grafo actual (expandir/contraer materias, entrar o salir del foco de una
  // materia). Sin esto, cambiar de foco dejaba la cámara en la posición del
  // grafo anterior y los nodos nuevos quedaban fuera de la vista.
  useEffect(() => {
    if (!rfInstanceRef.current) return;
    const timeout = setTimeout(() => {
      if (matchingIds && matchingIds.size > 0) {
        const visibleMatches = positioned.filter((n) => matchingIds.has(n.id));
        if (visibleMatches.length > 0) {
          rfInstanceRef.current?.fitView({ nodes: visibleMatches, duration: 400, padding: 0.3 });
          return;
        }
      }
      rfInstanceRef.current?.fitView({ duration: 400, padding: 0.2 });
    }, 60); // esperar al próximo layout tras expandir materias / cambiar de foco
    return () => clearTimeout(timeout);
  }, [matchingIds, positioned]);

  const neighborIds = useMemo(() => {
    if (!selected) return null;
    const ids = new Set<string>([selected.id]);
    for (const e of rawEdges) {
      if (e.source === selected.id) ids.add(e.target);
      if (e.target === selected.id) ids.add(e.source);
    }
    return ids;
  }, [selected, rawEdges]);

  const nodes = useMemo(
    () =>
      positioned.map((n) => {
        const dimmed = (matchingIds ? !matchingIds.has(n.id) : false) || (neighborIds ? !neighborIds.has(n.id) : false);
        const highlighted = (matchingIds?.has(n.id) ?? false) || n.id === selected?.id;
        return { ...n, style: nodeStyle(n.data.entityType, dimmed, highlighted) };
      }),
    [positioned, matchingIds, neighborIds, selected],
  );

  const edges = useMemo(
    () =>
      rawEdges.map((e) => {
        const relatedToSelection = neighborIds ? neighborIds.has(e.source) && neighborIds.has(e.target) : true;
        return {
          ...e,
          style: { stroke: neighborIds && !relatedToSelection ? "#1D2328" : "#3A424A" },
          animated: !!(selected && relatedToSelection && e.source === selected.id),
        };
      }),
    [rawEdges, neighborIds, selected],
  );

  const onNodeClick: NodeMouseHandler = (_evt, node) => {
    setSelected({ type: (node.data as NodeData).entityType, id: node.id });
  };

  const onNodeDoubleClick: NodeMouseHandler = (_evt, node) => {
    if ((node.data as NodeData).entityType !== "subject") return;
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  function toggleType(type: MapEntityType) {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleShowAllTopics() {
    const totalNewNodes = data.topics.filter((t) => !expandedSubjects.has(t.subject_id)).length;
    if (totalNewNodes > 50) {
      const confirmed = window.confirm(
        `Esto va a mostrar ${data.topics.length} temas en total (${totalNewNodes} más de los que ves ahora) y sus conexiones. Puede tardar unos segundos y hacer la vista más difícil de leer. ¿Mostrar todos?`,
      );
      if (!confirmed) return;
    }
    setFocusSubjectId(null);
    setExpandedSubjects(new Set(data.subjects.map((s) => s.id)));
  }

  const sortedSubjects = useMemo(() => [...data.subjects].sort((a, b) => a.title.localeCompare(b.title)), [data.subjects]);

  return (
    <div className="relative h-[70vh] rounded border border-border-subtle bg-surface">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        // El mínimo de zoom por defecto de reactflow (0.5) no alcanza para
        // encuadrar los ~549 nodos de "Mostrar todos los temas": fitView
        // quedaba pegado a ese piso y solo mostraba una esquina del grafo en
        // vez de la vista general que el usuario esperaba. Bajarlo permite
        // ver el grafo completo alejado (para orientarse) y volver a
        // acercarse con scroll/Controls para leer un nodo puntual.
        minZoom={0.05}
        proOptions={{ hideAttribution: true }}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={() => setSelected(null)}
        onInit={(instance) => {
          rfInstanceRef.current = instance;
        }}
      >
        <Background color="#1D2328" gap={24} />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => TYPE_COLOR[(n.data as NodeData).entityType]}
          nodeStrokeColor={(n) => TYPE_COLOR[(n.data as NodeData).entityType]}
          nodeStrokeWidth={3}
          nodeBorderRadius={4}
          maskColor="rgba(9,11,13,0.75)"
          style={{ background: "#111418", border: "1px solid #293037" }}
          className="!h-48 !w-64"
        />

        <Panel position="top-left">
          <div className="w-64 space-y-2 rounded border border-border bg-surface-elevated p-3">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (searchParams.get("buscar")) setSearchParams({}, { replace: true });
              }}
              placeholder="Buscar entre los 492 temas…"
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            {searchLower && (
              <p className="text-[11px] text-text-muted">
                {fullMatches.length === 0 ? "Sin resultados" : `${fullMatches.length} resultado(s)`}
              </p>
            )}

            <div className="space-y-1 border-t border-border-subtle pt-2">
              <label className="block text-[11px] uppercase tracking-wide text-text-secondary">Enfocar una materia</label>
              <select
                value={focusSubjectId ?? ""}
                onChange={(e) => setFocusSubjectId(e.target.value || null)}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="">Todas las materias ({data.subjects.length})</option>
                {sortedSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              {focusSubjectId && (
                <p className="text-[10px] text-text-muted">
                  Viendo solo esta materia y lo que cuelga de ella. Los botones de abajo dejan de aplicar hasta que
                  quites el foco.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowLegend((s) => !s)}
                className="text-xs uppercase tracking-wide text-text-secondary hover:text-accent"
              >
                {showLegend ? "Ocultar filtro por tipo" : "Filtrar por tipo de nodo"}
              </button>
              {showLegend && (
                <div className="flex gap-2 text-[10px] text-text-muted">
                  <button onClick={() => setHiddenTypes(new Set())} className="hover:text-accent">
                    Mostrar todo
                  </button>
                  <button
                    onClick={() => setHiddenTypes(new Set([...RENDERED_TYPES, ...OPTIONAL_RENDERED_TYPES]))}
                    className="hover:text-accent"
                  >
                    Ocultar todo
                  </button>
                </div>
              )}
            </div>
            {showLegend && (
              <ul className="space-y-1">
                {[...RENDERED_TYPES, ...OPTIONAL_RENDERED_TYPES].map((type) => (
                  <li key={type}>
                    <button
                      onClick={() => toggleType(type)}
                      className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs ${
                        hiddenTypes.has(type) ? "text-text-muted opacity-50" : "text-text-secondary"
                      }`}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[type] }} />
                      {TYPE_LABEL[type]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1 border-t border-border-subtle pt-2">
              <button
                onClick={handleShowAllTopics}
                className="block w-full rounded border border-border px-2 py-1 text-left text-[11px] uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
              >
                Mostrar todos los temas
              </button>
              <button
                onClick={() => {
                  setFocusSubjectId(null);
                  setExpandedSubjects(new Set());
                }}
                className="block w-full rounded border border-border px-2 py-1 text-left text-[11px] uppercase tracking-wide text-text-secondary hover:border-accent hover:text-accent"
              >
                Contraer todas las materias
              </button>
              <label className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={showNotes}
                  onChange={(e) => {
                    setShowNotes(e.target.checked);
                    setHiddenTypes((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete("obsidian_note");
                      else next.add("obsidian_note");
                      return next;
                    });
                  }}
                />
                Mostrar notas de Obsidian (de los temas visibles)
              </label>
            </div>
            <p className="text-[10px] text-text-muted">Doble clic en una materia colapsa/expande sus temas.</p>
          </div>
        </Panel>

        <Panel position="top-right">
          <div className="w-64 space-y-2 rounded border border-border bg-surface-elevated p-3">
            <button
              onClick={() => setShowCompleteness((s) => !s)}
              className="text-xs uppercase tracking-wide text-text-secondary hover:text-accent"
            >
              {showCompleteness ? "Ocultar completitud" : "Ver completitud"}
            </button>
            {showCompleteness && (
              <>
                <ul className="space-y-0.5 text-xs text-text-secondary">
                  {[...RENDERED_TYPES, ...OPTIONAL_RENDERED_TYPES].map((type) => (
                    <li key={type} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[type] }} />
                        {TYPE_LABEL[type]}
                      </span>
                      <span className="tabular-nums text-text-primary">{completeness.counts[type]}</span>
                    </li>
                  ))}
                </ul>
                {completeness.alerts.length > 0 ? (
                  <ul className="space-y-1 border-t border-border-subtle pt-2 text-[11px] text-warning">
                    {completeness.alerts.map((alert) => (
                      <li key={alert}>⚠ {alert}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-t border-border-subtle pt-2 text-[11px] text-success">Sin brechas detectadas.</p>
                )}
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {selected && <EntityDetailPanel entity={selected} data={data} onClose={() => setSelected(null)} />}
    </div>
  );
}
