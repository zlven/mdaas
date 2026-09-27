/**
 * Shared prompt assembly for the workflow definitions.
 *
 * A step's prompt is the **user turn** of its model call; the agent's own
 * `systemPrompt` is the system turn. That division is what keeps
 * `prompts/<agent>.md` the single source of truth for a domain's obligations —
 * the untrusted-reference clause, the empty-retrieval clause, the language
 * clause and the safety boundary all still apply on every step, because they
 * live in the system prompt and are not re-stated here.
 *
 * What lives here instead is the small amount of framing every step needs: the
 * user's own words, what the previous steps produced, and the one instruction
 * that makes `result: "sections"` work — that a step writes the body of its
 * section and not a heading for it, because the engine emits the heading
 * (`lib/workflow/run.ts`, `renderResult`).
 */

import type { StepContext } from "@/lib/workflow/types";

/** The user's own words, quoted so a step cannot mistake them for instructions to itself. */
export function ask(ctx: StepContext): string {
  return `用户的原话：\n「${ctx.input}」`;
}

/**
 * The outputs of the steps before this one, in order.
 *
 * Empty string when this is the first step, so a caller can concatenate it
 * without a conditional and without leaving a stray blank block in the prompt.
 */
export function priorOutputs(ctx: StepContext): string {
  if (ctx.outputs.length === 0) return "";

  const blocks = ctx.outputs.map((output) => `【${output.label}】\n${output.text}`).join("\n\n");
  return `前面几步已经产出的内容：\n\n${blocks}\n\n`;
}

/**
 * The body-only rule for a multi-step workflow.
 *
 * Without it a model reliably prefixes its answer with a markdown heading of its
 * own devising, and the finished artefact ends up with two headings per section
 * — one from the model, one from `renderResult` — with different wording.
 */
export const BODY_ONLY = "只输出这一段正文，不要写标题，不要复述本提示词，不要解释你在做什么。";

/** The same rule, phrased for a step that produces a list rather than prose. */
export const LIST_ONLY = "直接输出列表本身，不要写标题，不要写前言或总结，不要复述本提示词。";
