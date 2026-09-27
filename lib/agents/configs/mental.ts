import type { AgentConfig } from "@/lib/agents/types";
import { NOT_IMPLEMENTED_PROMPT } from "@/lib/agents/stub-prompt";

/**
 * Coming Soon — docs/04_AGENT_SPEC.md §4.5.
 *
 * One of the three that no one should ship without a dedicated review. The
 * `crisis-escalation` policy is recorded here so Phase 2 does not have to
 * rediscover the obligation.
 */
export const mental: AgentConfig = {
  id: "mental",
  name: "Mental Wellness Companion",
  nameZh: "AI 心理健康情绪陪伴专家",
  icon: "🧠",
  category: "health",
  description: "记录情绪、梳理压力、练习正念。不做诊断，高风险情况会引导你寻求专业帮助。",
  capabilities: ["情绪记录", "压力梳理", "正念练习", "睡眠调节"],
  enabled: false,
  systemPrompt: NOT_IMPLEMENTED_PROMPT,
  knowledgeBase: null,
  tools: [],
  workflows: [],
  modelProfile: "balanced",
  safetyPolicy: "crisis-escalation",
  suggestedPrompts: [],
};
