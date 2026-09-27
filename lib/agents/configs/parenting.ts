import type { AgentConfig } from "@/lib/agents/types";
import { NOT_IMPLEMENTED_PROMPT } from "@/lib/agents/stub-prompt";

/**
 * Coming Soon — docs/04_AGENT_SPEC.md §4.5.
 *
 * `minor-safety` applies here: age-appropriate content, data minimisation, no
 * emotional dependency, and no diagnosis of a child. One of the three requiring
 * dedicated review before release.
 */
export const parenting: AgentConfig = {
  id: "parenting",
  name: "Parenting Companion",
  nameZh: "AI 亲子教育陪伴专家",
  icon: "🧒",
  category: "life",
  description: "按孩子的年龄段给出沟通和陪伴的方法。不做儿童诊断。",
  capabilities: ["亲子沟通", "习惯培养", "情绪引导", "年龄特点"],
  enabled: false,
  systemPrompt: NOT_IMPLEMENTED_PROMPT,
  knowledgeBase: null,
  tools: [],
  workflows: [],
  modelProfile: "balanced",
  safetyPolicy: "minor-safety",
  suggestedPrompts: [],
};
