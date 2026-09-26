import type { AgentConfig } from "@/lib/agents/types";
import { NOT_IMPLEMENTED_PROMPT } from "@/lib/agents/stub-prompt";

/** Coming Soon — docs/04_AGENT_SPEC.md §4.4. */
export const style: AgentConfig = {
  id: "style",
  name: "Style & Image Consultant",
  nameZh: "AI 穿搭美学形象设计专家",
  icon: "👗",
  category: "life",
  description: "按场合、身材和预算，给出能直接照着买的穿搭方案。",
  capabilities: ["穿搭搭配", "体型分析", "色彩选择", "场合着装"],
  enabled: false,
  systemPrompt: NOT_IMPLEMENTED_PROMPT,
  knowledgeBase: null,
  tools: [],
  workflows: [],
  modelProfile: "creative",
  safetyPolicy: "content-default",
  suggestedPrompts: [],
};
