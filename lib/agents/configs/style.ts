import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.5 — `content-default`.
 *
 * The boundary here is manner rather than regulation (`prompts/style.md` §6):
 * no judging the user's body, no promised 显瘦/显高/减龄 effects, no brand or
 * shop recommendations, and no assuming gender, age or budget the profile does
 * not state.
 */
export const style: AgentConfig = {
  id: "style",
  name: "Style & Image Consultant",
  nameZh: "AI 穿搭美学形象设计专家",
  icon: "👗",
  /** Plum — fabric, texture, the one tint that had to read as taste. */
  tint: "#934c82",
  category: "life",
  description: "按场合、身材和预算，给出能直接照着买的穿搭方案。",
  capabilities: ["穿搭搭配", "体型分析", "色彩选择", "场合着装"],
  // Height and build are the two facts every fit answer depends on, and the two
  // a user should not have to retype each time. Occasion and budget change per
  // question, so they are asked rather than stored (04_AGENT_SPEC.md §6).
  profile: [
    {
      key: "height",
      label: "身高",
      type: "number",
      unit: "cm",
    },
    {
      key: "build",
      label: "体型描述",
      type: "select",
      options: ["上身偏宽", "下身偏宽", "整体偏瘦", "整体偏壮", "比较匀称", "不确定"],
    },
    {
      key: "palette",
      label: "平时穿得多的颜色",
      type: "text",
      hint: "比如：黑灰白为主、喜欢深蓝、常穿大地色",
    },
    {
      key: "scenes",
      label: "最常见的场合",
      type: "select",
      options: ["日常通勤", "商务正式", "休闲外出", "需要经常见客户", "学生"],
    },
  ],
  enabled: true,
  systemPrompt: PROMPTS.style,
  knowledgeBase: "style",
  // From `knowledge/style/预算与购物决策.md`. Net of returns, because that
  // document's whole argument is about the real cost of what was kept rather than
  // the headline cost of what was ordered.
  metrics: [
    { key: "clothing-spend", label: "置装支出", unit: "元", basis: "当月买衣服鞋包的总花费，退掉的那部分扣掉" },
  ],
  tools: ["cost-per-wear"],
  workflows: [],
  modelProfile: "creative",
  safetyPolicy: "content-default",
  suggestedPrompts: [
    "下周要去面试，衣柜里都是休闲装，帮我看看该准备哪几件",
    "身高一米六，下半身偏宽，怎么穿能显得利落一点",
    "衣柜塞满了但每天还是没得穿，帮我看看问题在哪",
  ],
};
