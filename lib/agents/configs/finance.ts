import type { AgentConfig } from "@/lib/agents/types";
import { NOT_IMPLEMENTED_PROMPT } from "@/lib/agents/stub-prompt";

/**
 * Coming Soon — docs/04_AGENT_SPEC.md §4.4.
 *
 * `financial-edu`, not financial advice: no securities recommendation, no
 * return guarantee, no principal guarantee.
 */
export const finance: AgentConfig = {
  id: "finance",
  name: "Personal Finance Educator",
  nameZh: "AI 个人理财教育专家",
  icon: "💰",
  category: "work",
  description: "讲清楚资产配置的思路和概念。只做理财教育，不推荐任何具体产品。",
  capabilities: ["资产配置科普", "记账方法", "风险认知", "保险科普"],
  enabled: false,
  systemPrompt: NOT_IMPLEMENTED_PROMPT,
  knowledgeBase: null,
  tools: [],
  workflows: [],
  modelProfile: "reasoning",
  safetyPolicy: "financial-edu",
  suggestedPrompts: [],
};
