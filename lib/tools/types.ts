/**
 * Tool ids and their metadata — docs/04_AGENT_SPEC.md §7
 *
 * Pure data, with no React import, because `lib/` must not depend on
 * `components/`. That constraint is what buys the type safety: `AgentConfig.tools`
 * is typed `ToolId`, so a typo in a config fails the typecheck, and
 * `components/tools/registry.tsx` declares its component map as
 * `Record<ToolId, …>`, so a tool with no component fails it too.
 *
 * Between those two there is no way to declare a tool that does not exist, which
 * is why nothing validates tool ids at runtime. A `validate()` rule in
 * `lib/agents/registry.ts` would be unreachable code guarding a case the
 * compiler already rejects.
 */

export const TOOL_IDS = [
  "food-tef",
  "meeting-cost",
  "speaking-time",
  "word-plan",
  "offer-compare",
  "emergency-fund",
  "cost-per-wear",
  "month-age",
  "bedtime",
  "time-diff",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export interface ToolDefinition {
  id: ToolId;
  /** Chinese, used as the panel's title. */
  label: string;
  /** One line under the title, saying what the tool does. */
  description: string;
}

/**
 * Display metadata, kept here rather than inside the components because two
 * places that do not render React need it: `AgentFacts`, which lists tool names
 * as part of describing the agent, and any future summary UI. If the label lived
 * in the component, `AgentFacts` would have to import a lazily-loaded component
 * to print a heading — which would defeat the lazy loading entirely.
 */
export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  "food-tef": {
    id: "food-tef",
    label: "食物热效应",
    description: "按这一餐的蛋白质、碳水和脂肪，估算消化本身要消耗多少能量。",
  },
  "meeting-cost": {
    id: "meeting-cost",
    label: "会议成本",
    description: "按人数、时长和平均时薪，算出这场会实际花掉多少钱。",
  },
  "speaking-time": {
    id: "speaking-time",
    label: "口播时长",
    description: "按中文口播语速，估算一段文案读出来需要多久。",
  },
  "word-plan": {
    id: "word-plan",
    label: "背单词计划",
    description: "按词汇量和每天新词，算出背完要多少天、哪天最重。",
  },
  "offer-compare": {
    id: "offer-compare",
    label: "offer 折算",
    description: "把两份 offer 的月薪、月数、年终奖和补贴，折成可以比的年总包。",
  },
  "emergency-fund": {
    id: "emergency-fund",
    label: "应急储备金",
    description: "按每月必要支出和目标月数，算出要存多少、还差多久。",
  },
  "cost-per-wear": {
    id: "cost-per-wear",
    label: "单次穿着成本",
    description: "按价格和预计穿多少次，算出这件衣服每次穿花掉多少。",
  },
  "month-age": {
    id: "month-age",
    label: "月龄计算",
    description: "按出生日期，算出精确的几岁几个月零几天。",
  },
  bedtime: {
    id: "bedtime",
    label: "就寝时间",
    description: "按起床时间和想睡多久，倒推今晚该几点上床。",
  },
  "time-diff": {
    id: "time-diff",
    label: "时差换算",
    description: "按出发和到达城市、出发时间与飞行时长，算出落地时当地几点、两地差几小时。",
  },
};
