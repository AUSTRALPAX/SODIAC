import dagre from "dagre";
import { Position, type Edge, type Node } from "reactflow";

/**
 * Auto-layout horizontal con dagre (elegido sobre elkjs: el grafo es chico
 * —decenas de materias, cientos de temas— y dagre resuelve esto en una
 * pasada síncrona sin worker ni DSL de opciones de layout adicional).
 * Reemplaza el cálculo manual de columnas/filas que tenía RelationsView.tsx.
 */
const NODE_WIDTH = 260;
const NODE_HEIGHT = 40;

export function layoutHorizontal(nodes: Node[], edges: Edge[]): Node[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 20, ranksep: 110 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const positioned = graph.node(node.id);
    return {
      ...node,
      position: { x: positioned.x - NODE_WIDTH / 2, y: positioned.y - NODE_HEIGHT / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}
