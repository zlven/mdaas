import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.5 — `content-default`.
 *
 * No special referral boundary, but `prompts/style.md`'s sibling rules apply
 * here in their own form (`prompts/career.md` §6): never invent experience the
 * user did not have, never promise an interview or an offer, no advice that
 * screens on sex, age, marital status, region or health, and no legal verdict
 * on a contract or a non-compete.
 */
export const career: AgentConfig = {
  id: "career",
  name: "Career & Interview Coach",
  nameZh: "AI 职场求职面试专家",
  icon: "🎯",
  /** Slate blue — prospects, professionalism, a horizon rather than a mood. */
  tint: "#4c6978",
  category: "work",
  description: "从简历到面试到谈薪，把求职当成一个可以提前准备的流程。",
  capabilities: ["简历优化", "面试准备", "谈薪策略", "职业规划"],
  // Which target and how much experience decide almost every answer, and they
  // change slowly enough to be standing facts. The current CV is not stored —
  // it is attached per conversation (04_AGENT_SPEC.md §6).
  profile: [
    {
      key: "target",
      label: "目标岗位",
      type: "text",
      hint: "比如：后端开发、市场运营、财务分析",
    },
    {
      key: "years",
      label: "工作年限",
      type: "select",
      options: ["应届或在校", "1–3 年", "3–5 年", "5–10 年", "10 年以上"],
    },
    {
      key: "stage",
      label: "目前到哪一步了",
      type: "select",
      options: ["还没开始准备", "在改简历", "在投递", "在面试", "拿到 offer 在比较", "在职想看机会"],
    },
    {
      key: "industry",
      label: "所在或想去的行业",
      type: "text",
      hint: "比如：互联网、制造业、医疗、教育",
    },
  ],
  enabled: true,
  systemPrompt: PROMPTS.career,
  knowledgeBase: "career",
  // `求职渠道与流程节奏.md` names 「每周投递的份数」 as the quantifiable progress
  // metric in a job search, which is the one part of that process the applicant
  // actually controls.
  metrics: [
    { key: "applications", label: "每周投递", unit: "份", basis: "这一周投出去的简历份数，按投递当天计" },
  ],
  tools: ["offer-compare"],
  workflows: [],
  modelProfile: "reasoning",
  safetyPolicy: "content-default",
  suggestedPrompts: [
    "帮我看一下这份简历，投了三十多家都没有回音",
    "下周面试，帮我准备一下可能会被问到的商品问题",
    "手里有两个 offer，薪资差得不多，帮我理一下该怎么比",
  ],
};
