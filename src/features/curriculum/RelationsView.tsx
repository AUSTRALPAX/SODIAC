import { useMemo, useState, type CSSProperties } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { layoutHorizontal } from "./mapLayout";
import { RENDERED_TYPES, TYPE_COLOR, TYPE_LABEL, type MapEntityType } from "./mapTypeColors";
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
    opacity: dimmed ? 0.25 : 1,
    boxShadow: highlighted ? `0 0 0 2px ${color}` : "none",
  };
}

function buildGraph(data: CurriculumData, hiddenTypes: Set<MapEntityType>, collapsedSubjects: Set<string>) {
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
    if (collapsedSubjects.has(s.id)) continue;
    for (const u of data.units.filter((x) => x.subject_id === s.id)) {
      addNode(u.id, "curriculum_unit", u.title);
      addEdge(s.id, u.id);
    }
  }
  for (const t of data.topics) {
    if (collapsedSubjects.has(t.subject_id)) continue;
    addNode(t.id, "topic", t.title);
    if (t.curriculum_unit_id) addEdge(t.curriculum_unit_id, t.id);
    else addEdge(t.subject_id, t.id);
    if (t.competency_id) addEdge(t.competency_id, t.id);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  return { nodes, edges: validEdges };
}

/**
 * Panel de completitud (H6): a partir de los mismos datos ya cargados por
 * useCurriculumData, sin consultas nuevas — el diagnóstico previo
 * (docs/STARTUP_PERSISTENCE_MAP_DIAGNOSIS.md) confirmó que lo que falta en
 * el Mapa es dato cargado, no código; este panel hace visible esa brecha.
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
    obsidian_note: 0,
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
  const [hiddenTypes, setHiddenTypes] = useState<Set<MapEntityType>>(new Set());
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showCompleteness, setShowCompleteness] = useState(true);
  const completeness = useMemo(() => computeCompleteness(data), [data]);

  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildGraph(data, hiddenTypes, collapsedSubjects),
    [data, hiddenTypes, collapsedSubjects],
  );
  const positioned = useMemo(() => layoutHorizontal(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const searchLower = search.trim().toLowerCase();
  const matchingIds = useMemo(
    () => (searchLower ? new Set(positioned.filter((n) => n.data.label.toLowerCase().includes(searchLower)).map((n) => n.id)) : null),
    [positioned, searchLower],
  );

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
    setCollapsedSubjects((prev) => {
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

  return (
    <div className="relative h-[70vh] rounded border border-border-subtle bg-surface">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={() => setSelected(null)}
      >
        <Background color="#1D2328" gap={24} />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => TYPE_COLOR[(n.data as NodeData).entityType]}
          maskColor="rgba(9,11,13,0.7)"
          style={{ background: "#111418" }}
        />

        <Panel position="top-left">
          <div className="w-64 space-y-2 rounded border border-border bg-surface-elevated p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => setShowLegend((s) => !s)}
              className="text-xs uppercase tracking-wide text-text-secondary hover:text-accent"
            >
              {showLegend ? "Ocultar leyenda" : "Mostrar leyenda"}
            </button>
            {showLegend && (
              <ul className="space-y-1">
                {RENDERED_TYPES.map((type) => (
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
                  {RENDERED_TYPES.map((type) => (
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
