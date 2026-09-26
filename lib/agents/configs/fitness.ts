import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.3 — the only live agent carrying a real safety
 * policy, and therefore the one the safety test exercises (06_ACCEPTANCE.md §I).
 * `health-edu` means education and lifestyle guidance only: no diagnosis, no
 * treatment, no prescription, no promised outcome.
 */
export const fitness: AgentConfig = {
  id: "fitness",
  name: "Fitness & Exercise Expert",
  nameZh: "AI 形体运动健身专家",
  icon: "🏋",
  category: "health",
  description: "把训练目标拆成能坚持下去的周计划。只谈生活方式，不做医疗建议。",
  capabilities: ["训练计划", "周计划编排", "习惯养成", "进度复盘", "营养科普"],
  enabled: true,
  systemPrompt: PROMPTS.fitness,
  knowledgeBase: "fitness",
  tools: [],
  workflows: ["fitness-plan"],
  modelProfile: "balanced",
  safetyPolicy: "health-edu",
  suggestedPrompts: [
    "我每周能练三次，家里只有一对哑铃，帮我排一个月的计划",
    "膝盖有旧伤，深蹲还能做吗？有没有替代动作",
    "帮我看看这份计划，强度是不是定得太高了",
  ],
};
