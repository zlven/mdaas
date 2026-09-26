import type { AgentConfig } from "@/lib/agents/types";
import { NOT_IMPLEMENTED_PROMPT } from "@/lib/agents/stub-prompt";

/** Coming Soon — docs/04_AGENT_SPEC.md §4.4. */
export const study: AgentConfig = {
  id: "study",
  name: "Exam Prep Planner",
  nameZh: "AI 考研公考学业规划专家",
  icon: "📚",
  category: "work",
  description: "把备考拆成阶段目标和每日任务，管进度，也管心态。",
  capabilities: ["备考规划", "院校选择", "复习方法", "进度管理"],
  enabled: false,
  systemPrompt: NOT_IMPLEMENTED_PROMPT,
  knowledgeBase: null,
  tools: [],
  workflows: [],
  modelProfile: "reasoning",
  safetyPolicy: "content-default",
  suggestedPrompts: [],
};
