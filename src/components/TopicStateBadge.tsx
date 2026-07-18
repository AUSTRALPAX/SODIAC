import {
  TOPIC_LEARNING_STATE_LABELS,
  TOPIC_LEARNING_STATE_TONE,
  type TopicLearningState,
} from "@/services/learningState";

const TONE_CLASSES: Record<string, string> = {
  muted: "text-text-muted",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
};

export function TopicStateBadge({ state }: { state: TopicLearningState }) {
  const tone = TOPIC_LEARNING_STATE_TONE[state];
  return <span className={`text-xs ${TONE_CLASSES[tone]}`}>{TOPIC_LEARNING_STATE_LABELS[state]}</span>;
}
