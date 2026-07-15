import { useMemo, type CSSProperties } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { MASTERY_LEVEL_COLOR } from "@/services/mastery";
import type { CurriculumData } from "./useCurriculumData";

const TOPIC_ROW_HEIGHT = 34;
const COL_X = { question: 0, subject: 340, topic: 680 };

function baseNodeStyle(bg: string, border: string): CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 6,
    color: "#F4F7F8",
    fontSize: 12,
    padding: "6px 10px",
    width: 260,
  };
}

export function RelationsView({ data }: { data: CurriculumData }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let topicCursor = 0;
    const topicYById = new Map<string, number>();

    for (const question of data.questions) {
      const subjects = data.subjects.filter((s) => s.fundamental_question_id === question.id);
      const subjectYs: number[] = [];

      for (const subject of subjects) {
        const topics = data.topics.filter((t) => t.subject_id === subject.id);
        const startY = topicCursor;
        for (const topic of topics) {
          const y = topicCursor * TOPIC_ROW_HEIGHT;
          topicYById.set(topic.id, y);
          const mastery = topic.competency_id ? data.masteryByCompetency.get(topic.competency_id) : undefined;
          const color = mastery ? MASTERY_LEVEL_COLOR[mastery.level] : "#293037";
          nodes.push({
            id: topic.id,
            position: { x: COL_X.topic, y },
            data: { label: topic.title },
            style: baseNodeStyle("#111418", color ?? "#293037"),
          });
          edges.push({
            id: `${subject.id}-${topic.id}`,
            source: subject.id,
            target: topic.id,
            style: { stroke: "#293037" },
          });
          topicCursor += 1;
        }
        const endY = Math.max(startY, topicCursor - 1);
        const subjectY = ((startY + endY) / 2) * TOPIC_ROW_HEIGHT;
        subjectYs.push(subjectY);
        nodes.push({
          id: subject.id,
          position: { x: COL_X.subject, y: subjectY },
          data: { label: subject.title },
          style: baseNodeStyle("#171B20", "#00D6C5"),
        });
        edges.push({
          id: `${question.id}-${subject.id}`,
          source: question.id,
          target: subject.id,
          style: { stroke: "#293037" },
        });
        if (topics.length === 0) topicCursor += 1;
      }

      const questionY = subjectYs.length > 0 ? subjectYs.reduce((a, b) => a + b, 0) / subjectYs.length : topicCursor * TOPIC_ROW_HEIGHT;
      nodes.push({
        id: question.id,
        position: { x: COL_X.question, y: questionY },
        data: { label: question.title },
        style: baseNodeStyle("#171B20", "#16F1DD"),
      });
      if (subjects.length === 0) topicCursor += 1;
    }

    return { nodes, edges };
  }, [data]);

  return (
    <div className="h-[70vh] rounded border border-border-subtle bg-surface">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#1D2328" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
