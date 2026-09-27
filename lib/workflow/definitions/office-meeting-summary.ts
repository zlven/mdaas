/**
 * `office-meeting-summary` — docs/01_PRD.md §8.3.
 *
 * One step, one structured call. It is a workflow rather than a bespoke code
 * path because F1 requires every functional agent to expose its workflow in the
 * chat input, and because error handling, retry and persistence are step-level
 * behaviours that would otherwise have to be written a second time here — four
 * chances to diverge from the seven-step path, to save one array element.
 *
 * `result: "document"`: the step's text is rendered unchanged. §8.3's seven
 * section names are owned by `prompts/office.md`, which is where they belong —
 * the same format has to hold when a user asks for a summary conversationally
 * without touching ⚡, and putting a second copy of the structure here would give
 * one expert two output formats that drift apart.
 */

import { ask } from "@/lib/workflow/definitions/shared";
import type { WorkflowDefinition } from "@/lib/workflow/types";

export const officeMeetingSummary: WorkflowDefinition = {
  id: "office-meeting-summary",
  label: "会议纪要",
  description: "把原始记录整理成决议、行动项、负责人和风险。",
  depth: "deep",
  maxTokensPerStep: 4000,
  result: "document",
  steps: [
    {
      id: "summary",
      label: "整理纪要",
      prompt: (ctx) =>
        "请把这次对话里的会议原始材料整理成一份完整的会议纪要。\n\n" +
        "原始材料可能来自两个地方，两处都要读：用户在下面说的话，以及随这条消息附上的文件" +
        "（如果有，它的全文会出现在参考资料里）。\n\n" +
        `${ask(ctx)}\n\n` +
        "按你一贯的会议纪要格式输出完整的各个部分，不要省略其中的任何一节。",
    },
  ],
};
