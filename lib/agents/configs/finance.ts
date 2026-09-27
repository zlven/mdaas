import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.5 — the safety-critical group.
 *
 * `financial-edu`, not financial advice: no securities recommendation, no
 * return guarantee, no principal guarantee, and no verdict on a specific
 * product, platform or ticker — including when the user presses for one.
 *
 * The boundary is `prompts/finance.md` §6. Nothing in the runtime reads
 * `safetyPolicy`; `06_ACCEPTANCE.md` I17 is the human check, and it has not
 * been run.
 */
export const finance: AgentConfig = {
  id: "finance",
  name: "Personal Finance Educator",
  nameZh: "AI 个人理财教育专家",
  icon: "💰",
  category: "work",
  description: "讲清楚资产配置的思路和概念。只做理财教育，不推荐任何具体产品。",
  capabilities: ["资产配置科普", "记账方法", "风险认知", "保险科普"],
  // Deliberately about *structure and constraints*, not about amounts. What
  // makes budgeting advice land is knowing the money's shape and how long it
  // has to last, not the balance (04_AGENT_SPEC.md §6).
  profile: [
    {
      key: "goal",
      label: "最想解决的一件事",
      type: "select",
      options: ["存不下钱", "不知道怎么放", "有负债要还", "想搞清楚保险", "只是先了解"],
    },
    {
      key: "horizon",
      label: "这笔钱大概多久不用",
      type: "select",
      options: ["随时可能用", "一到三年", "三年以上", "还没想过"],
    },
    {
      key: "tolerance",
      label: "能接受多大波动",
      type: "select",
      options: ["一点都不能亏", "小幅波动可以", "能接受明显波动", "不清楚"],
    },
    {
      key: "debt",
      label: "目前的负债情况",
      type: "select",
      options: ["没有负债", "有房贷或车贷", "有消费类欠款", "不便说"],
    },
  ],
  enabled: true,
  systemPrompt: PROMPTS.finance,
  knowledgeBase: "finance",
  tools: [],
  workflows: [],
  modelProfile: "reasoning",
  safetyPolicy: "financial-edu",
  suggestedPrompts: [
    "每个月工资到手就没，帮我看看钱到底该怎么分",
    "手里有几万块闲钱，完全不懂理财，应该先搞清楚哪几件事",
    "有人推荐了一个年化很高的产品，怎么判断靠不靠谱",
  ],
};
