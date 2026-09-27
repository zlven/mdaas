import type { AgentConfig } from "@/lib/agents/types";
import { NOT_IMPLEMENTED_PROMPT } from "@/lib/agents/stub-prompt";

/** Coming Soon — docs/04_AGENT_SPEC.md §4.5. */
export const career: AgentConfig = {
  id: "career",
  name: "Career & Interview Coach",
  nameZh: "AI 职场求职面试专家",
  icon: "🎯",
  category: "work",
  description: "从简历到面试到谈薪，把求职当成一个可以提前准备的流程。",
  capabilities: ["简历优化", "面试准备", "谈薪策略", "职业规划"],
  enabled: false,
  systemPrompt: NOT_IMPLEMENTED_PROMPT,
  knowledgeBase: null,
  tools: [],
  workflows: [],
  modelProfile: "reasoning",
  safetyPolicy: "content-default",
  suggestedPrompts: [],
};
