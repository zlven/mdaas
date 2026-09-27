/**
 * `creator-30day` — the flagship workflow. docs/01_PRD.md §8.2.
 *
 * Seven steps, seven model calls, seven visible stages, and step 7 is **not
 * optional** (`00_PRODUCT_BRIEF.md` §8 records the draft that omitted it). The
 * seven Chinese labels below are the ones `docs/03_UI_UX_SPEC.md` §7 draws, and
 * `scripts/verify-workflow.mts` asserts them verbatim — the label is also the
 * heading `renderResult` emits, so a rename here renames a section of the
 * finished artefact.
 *
 * `result: "sections"` is why each step asks for the body of its section and
 * nothing else: the engine owns the headings, so §8.2's "all seven must appear
 * as distinct sections" holds even if a model answers in prose.
 */

import { ask, BODY_ONLY, LIST_ONLY, priorOutputs } from "@/lib/workflow/definitions/shared";
import type { WorkflowDefinition } from "@/lib/workflow/types";

export const creator30day: WorkflowDefinition = {
  id: "creator-30day",
  label: "30 天内容计划",
  description: "七步跑完一个月的选题、标题和发布日历。",
  // The run the user has explicitly agreed to wait for — 02_TECH_SPEC.md §6.4.1
  // reserves high effort for exactly this.
  depth: "deep",
  maxTokensPerStep: 4000,
  result: "sections",
  steps: [
    {
      id: "positioning",
      label: "分析账号定位",
      maxTokens: 1800,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n` +
        "请为这个账号做定位分析：赛道与细分切口、差异化角度、一句话定位陈述，" +
        "以及为了立住这个定位应当避开的方向。\n" +
        BODY_ONLY,
    },
    {
      id: "audience",
      label: "定义目标受众",
      maxTokens: 2000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请定义这个账号的目标受众：他们是谁、当前处在什么状态、真正想解决的是什么、" +
        "以及他们已经在哪些地方、看什么内容。\n" +
        BODY_ONLY,
    },
    {
      id: "pillars",
      label: "设计内容支柱",
      maxTokens: 2500,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请设计 3 到 5 个内容支柱。每个支柱给出名称、它覆盖什么、以及**为什么是这个账号需要它**。" +
        "支柱之间不要重叠。\n" +
        BODY_ONLY,
    },
    {
      id: "topics",
      label: "生成 30 个选题",
      // Thirty concrete topics is the largest single output in the workflow.
      maxTokens: 8000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请生成 30 个具体选题，按上面的内容支柱分配。每个选题写清" +
        "**做什么内容、给谁看、解决什么疑问**，不要写成宽泛的栏目名。\n" +
        LIST_ONLY,
    },
    {
      id: "titles",
      label: "生成标题",
      maxTokens: 6000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请为上面每一个选题写一条可以直接用的标题，编号与选题一一对应。" +
        "标题要具体、有信息量，不要用夸张到失真的说法。\n" +
        LIST_ONLY,
    },
    {
      id: "calendar",
      label: "生成发布日历",
      // A 30-day schedule is the other large output.
      maxTokens: 8000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请把选题排进 30 天的发布日历：第几天发什么、发布节奏怎么安排、" +
        "哪些内容适合放在一起形成系列。用表格输出。\n" +
        BODY_ONLY,
    },
    {
      id: "growth",
      label: "增长建议",
      maxTokens: 3000,
      prompt: (ctx) =>
        `${ask(ctx)}\n\n${priorOutputs(ctx)}` +
        "请给出执行建议：前两周先做什么、看哪几个指标判断方向对不对、" +
        "哪些信号出现时应当调整而不是继续、以及最容易做错的地方。\n" +
        "不要承诺涨粉数字或流量结果。\n" +
        BODY_ONLY,
    },
  ],
};
