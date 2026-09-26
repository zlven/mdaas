import type { AgentConfig } from "@/lib/agents/types";
import { NOT_IMPLEMENTED_PROMPT } from "@/lib/agents/stub-prompt";

/** Coming Soon — docs/04_AGENT_SPEC.md §4.4. No prompt, no knowledge base. */
export const hair: AgentConfig = {
  id: "hair",
  name: "Scalp & Hair Health Expert",
  nameZh: "AI 头皮毛发健康专家",
  icon: "💇",
  category: "health",
  description: "从头皮护理到作息和饮食，聊怎么把头发养回来。不做诊断，也不开方。",
  capabilities: ["头皮护理", "掉发科普", "洗护习惯", "作息饮食"],
  enabled: false,
  systemPrompt: NOT_IMPLEMENTED_PROMPT,
  knowledgeBase: null,
  tools: [],
  workflows: [],
  modelProfile: "balanced",
  safetyPolicy: "health-edu",
  suggestedPrompts: [],
};
