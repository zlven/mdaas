/**
 * `fitness-plan` — docs/01_PRD.md §8.4.
 *
 * One step, one structured call, over whatever the user brought: the message they
 * typed and the profile they have already filled in, which the engine injects
 * into the system prompt on every step.
 *
 * **There is no intake form, and that is a deliberate trade.** §8.4 describes the
 * plan as "driven by a short intake", and a form would produce a better plan for
 * a first-time visitor — but it would be per-workflow UI, and a component that
 * switches on a workflow id is the same smell as branching on an agent id.
 * Instead the contract of the ⚡ control is uniform at every count: *run this
 * agent's workflow on whatever is in the box*. What is missing is named as an
 * assumption rather than asked for, which is `04_AGENT_SPEC.md` §3's existing rule
 * and is also what the demo needs to show — a plan first, a refinement offered
 * after, rather than six questions before anything.
 *
 * `result: "document"`: §8.4's six section names belong to `prompts/fitness.md`,
 * along with the `health-edu` boundary (no diagnosis, no prescription, no promised
 * outcome, and pain / injury / pregnancy / chronic disease routed to a
 * professional). Duplicating either here would give the agent two formats.
 */

import { ask } from "@/lib/workflow/definitions/shared";
import type { WorkflowDefinition } from "@/lib/workflow/types";

export const fitnessPlan: WorkflowDefinition = {
  id: "fitness-plan",
  label: "训练计划",
  description: "按目标和条件排一份可以照着练的计划。",
  depth: "deep",
  maxTokensPerStep: 5000,
  result: "document",
  steps: [
    {
      id: "plan",
      label: "排训练计划",
      prompt: (ctx) =>
        "请根据用户的目标和现有条件，排一份可以照着练的训练计划。\n\n" +
        `${ask(ctx)}\n\n` +
        "先给出完整的计划，再说清楚这个计划适合什么人练、补上哪几项信息可以让它更贴合。" +
        "按你一贯的训练计划格式输出完整的各个部分，不要省略其中的任何一节。",
    },
  ],
};
