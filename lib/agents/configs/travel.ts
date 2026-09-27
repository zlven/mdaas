import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.10 — the tenth agent.
 *
 * `content-default` policy, with the boundary written as §六 of `prompts/travel.md`
 * rather than as a disclaimer: no prices, no timetables, no opening hours, no
 * visa rules. Those are the facts that change under the user's feet and that we
 * cannot source, so the agent gives the framework and names the official channel.
 * It is the same rule as `CLAUDE.md`'s "never invent provider API details",
 * applied to travel — and it is the boundary the product chose when it picked
 * 行程规划与攻略 over 出境游.
 *
 * `balanced` rather than `reasoning`: this is planning and prose, not analysis,
 * and it is the depth `mental` and `parenting` already use for the same reason.
 *
 * `category: "life"` is dead data at runtime — nothing partitions on it, and
 * `components/agent/tint.ts` derives the card's hue from the **id** — so a tenth
 * agent needs no colour or layout change anywhere.
 */
export const travel: AgentConfig = {
  id: "travel",
  name: "Travel Planning Expert",
  nameZh: "AI 旅行行程规划专家",
  icon: "🧭",
  category: "life",
  description: "把天数和预算排成一份走得下来的行程，管节奏、交通和行前准备。",
  capabilities: ["行程规划", "节奏把控", "交通衔接", "行前准备"],
  // The suggested prompts below already ask about days, companions and dates.
  // A profile is what turns those one-off questions into standing facts the
  // agent stops having to ask for (docs/04_AGENT_SPEC.md §6).
  profile: [
    {
      key: "companions",
      label: "同行人",
      type: "select",
      options: ["一个人", "两个人", "带小孩", "带长辈", "朋友结伴"],
    },
    {
      key: "pace",
      label: "旅行节奏",
      type: "select",
      options: ["紧凑", "适中", "松弛"],
    },
    {
      key: "budget",
      label: "预算档位",
      type: "select",
      options: ["经济", "舒适", "品质"],
    },
    {
      key: "fromCity",
      label: "出发城市",
      type: "text",
      hint: "比如：上海。影响大交通和时差的判断",
    },
    {
      key: "status",
      label: "行程进度",
      type: "select",
      options: ["还没定", "大致定了", "机票已订"],
    },
  ],
  enabled: true,
  systemPrompt: PROMPTS.travel,
  knowledgeBase: "travel",
  // 时差换算 is the one thing here the browser can answer instantly and exactly.
  // The rest of the domain is judgement, which is the agent's job, not a widget's.
  // From `knowledge/travel/旅行预算构成.md`. One number per trip rather than per
  // day, because the document's own framing is that a trip's cost is decided
  // before it starts — by the transport and the nights, not by the spending
  // during it.
  metrics: [
    {
      key: "trip-cost",
      label: "每次旅行花费",
      unit: "元",
      basis: "一趟旅行的总花费：交通 + 住宿 + 门票 + 餐饮",
    },
  ],
  tools: ["time-diff"],
  workflows: ["travel-itinerary"],
  modelProfile: "balanced",
  safetyPolicy: "content-default",
  suggestedPrompts: [
    "十月去日本玩七天，两个人，帮我排一版行程",
    "带三岁小孩去海边，五天，帮我看看这份行程是不是排太满了",
    "第一次出国，帮我说清楚出发前要按什么顺序准备",
  ],
};
