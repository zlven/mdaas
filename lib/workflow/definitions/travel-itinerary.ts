/**
 * `travel-itinerary` — docs/01_PRD.md §8.5.
 *
 * Six steps, six model calls, six visible stages, ending in one artefact whose
 * sections are the six headings below. The steps run in the order a trip is
 * actually planned: decide what kind of trip it is, decide how the days split,
 * fill in the days, connect them, price them, then prepare for them.
 *
 * **Six and not seven.** `creator-30day` is seven calls and takes most of a demo,
 * and step 6 already folds packing and risk together — they are both "before you
 * go" and neither needs its own model call. The order within each step is what
 * carries the value here, not the count.
 *
 * `result: "sections"` is why every step asks for the body of its section and
 * nothing else: the engine owns the headings, so the artefact carries all six
 * sections even when a model answers in prose (§8.2's rule, applied here).
 *
 * **Every step inherits `prompts/travel.md` as its system turn**, which is where
 * the boundary lives: no prices, no timetables, no opening hours, no visa rules —
 * a framework and the official source instead. Nothing about that is restated
 * below, and it must not be: a boundary written in two places is one that will
 * eventually be written in two different ways.
 */

import { ask, BODY_ONLY, priorOutputs } from "@/lib/workflow/definitions/shared";
import type { WorkflowDefinition } from "@/lib/workflow/types";

export const travelItinerary: WorkflowDefinition = {
  id: "travel-itinerary",
  label: "行程规划",
  description: "六步排完一趟旅行：节奏、天数、每日安排、交通、预算、行前准备。",
  // The run the user has explicitly agreed to wait for — 02_TECH_SPEC.md §6.4.1
  // reserves high effort for exactly this.
  depth: "deep",
  maxTokensPerStep: 4000,
  result: "sections",
  steps: [
    {
      id: "shape",
      label: "判断旅行类型与节奏",
      maxTokens: 1800,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n` +
        "请先判断这趟旅行的类型和应有的节奏：同行人是谁、这趟旅行真正想要的是什么、" +
        "以及按这个条件，节奏应该偏紧凑还是偏松弛。给出判断依据。" +
        "如果信息不足，把你假设的条件明确写出来。\n" +
        BODY_ONLY,
    },
    {
      id: "budget",
      label: "交通与住宿框架",
      maxTokens: 3000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请给出交通与住宿的框架：城市之间怎么走、大概什么量级的耗时、中转要留出什么、" +
        "以及住宿应该选在哪个区域、按什么标准选。只给框架和判断标准。" +
        "不要给出具体票价、班次时刻或商家名称。\n" +
        BODY_ONLY,
    },
    {
      id: "days",
      label: "分配城市与天数",
      maxTokens: 2500,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请给出整体安排：去哪几个地方、每个地方待几天、为什么这么分，以及被舍弃的目的地和不去的理由。" +
        "如果天数不够支撑当前的目的地数量，直接说明，并给出砍掉哪一个的建议。\n" +
        BODY_ONLY,
    },
    {
      id: "daily",
      label: "安排每日行程",
      // The largest single output in the workflow — one row per day.
      maxTokens: 8000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请排出每日行程，用表格：天 | 上午 | 下午 | 晚上 | 住哪一带。" +
        "每天只放一条主线，其余作为备选，并留出空白时间。" +
        "移动日不要安排重头戏。不要写具体门票、价格或开放时间。\n" +
        BODY_ONLY,
    },
    {
      id: "cost",
      label: "预算分配",
      maxTokens: 2500,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请给出预算构成：钱主要花在哪几块、大概的比例关系、哪一块弹性最大、" +
        "以及按这个行程最容易超支的地方在哪里。" +
        "不要报具体价格或汇率，只讲构成和分配思路。\n" +
        BODY_ONLY,
    },
    {
      id: "prepare",
      label: "行前准备与风险应对",
      maxTokens: 4000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请给出行前准备与风险应对：按出发前四周、两周、三天、当天的时间顺序列出要做的事；" +
        "指出这趟行程里最需要提前确认的（需要预约的项目、证件与有效期的确认渠道）以及最可能出问题的环节和应对顺序。" +
        "凡是会变动的具体规定，只说去哪个官方渠道确认，不要给出结论性数字。\n" +
        BODY_ONLY,
    },
  ],
};
