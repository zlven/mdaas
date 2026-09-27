/**
 * The workflow engine — docs/02_TECH_SPEC.md §10
 *
 * A run is an explicit sequence of steps. This file is the only thing that calls
 * a model on a workflow's behalf, and it contains **no runtime import from
 * `lib/llm/`** beyond the error constructors — every provider-facing type it
 * mentions (`ChatMessage`, `Effort`, `StreamChunk`) is type-only.
 *
 * That is not tidiness. The model call arrives as an injected `StepCaller`, which
 * buys two things at once:
 *
 *   1. **C3.** The engine is provider-agnostic by construction rather than by
 *      discipline — there is no import it could accidentally use.
 *   2. **A Node test that can fail.** `scripts/verify-workflow.mts` drives seven
 *      steps, a mid-run failure and an abort with a scripted generator, in a
 *      plain Node process. Without injection the test would drag in the Anthropic
 *      SDK through `lib/llm/gateway.ts` and could not make step 3 fail at all.
 *
 * The events it yields carry the updated `WorkflowRun` on every occurrence, which
 * is what lets the caller write to the store on a schedule (see
 * `lib/store/workflow-runs.ts`) instead of mirroring the engine's state and
 * risking the two drifting apart.
 *
 * Two rules the loop below exists to enforce, both stated as acceptance criteria:
 *
 *   - **It never advances past a failed step** (F5). A run's steps are therefore
 *     always `[done…, failed?, pending…]`, and a retry is a resume from that index
 *     rather than a re-run of the whole thing.
 *   - **A step's text is never discarded** (§10: "never discard work the user paid
 *     for"). A step that streamed nine hundred tokens and then hit a rate limit
 *     keeps them, underneath the error.
 */

import { appError, type AppError } from "@/lib/llm/errors";
import type { ChatMessage, Effort, StreamChunk } from "@/lib/llm/types";

import { appendText, failStep, finishRun, finishStep, startStep } from "@/lib/workflow/run";
import type {
  StepContext,
  WorkflowDefinition,
  WorkflowDepth,
  WorkflowRun,
  WorkflowStep,
} from "@/lib/workflow/types";

/** `02_TECH_SPEC.md` §6.4.1 — "reserve high effort for workflow steps". */
const EFFORT: Record<WorkflowDepth, Effort> = { standard: "medium", deep: "high" };

export interface StepCall {
  readonly system: string;
  readonly messages: ChatMessage[];
  readonly maxTokens: number;
  readonly effort: Effort;
}

/**
 * One model call.
 *
 * **Must never throw** — a failure is an `error` chunk, exactly as
 * `lib/llm/gateway.ts`'s `stream()` guarantees. The production implementation is
 * a two-line closure over `stream()`; the test implementation is a scripted
 * `AsyncGenerator`. Both honour that contract, and the engine has no second
 * failure path to keep in sync.
 */
export type StepCaller = (call: StepCall, signal?: AbortSignal) => AsyncGenerator<StreamChunk>;

export type WorkflowEvent =
  | { type: "step-start"; index: number; stepId: string; run: WorkflowRun }
  | { type: "step-text"; index: number; stepId: string; value: string; run: WorkflowRun }
  | { type: "step-done"; index: number; stepId: string; outputTokens?: number; run: WorkflowRun }
  | { type: "step-error"; index: number; stepId: string; error: AppError; run: WorkflowRun }
  | { type: "run-done"; run: WorkflowRun };

export interface RunWorkflowOptions {
  readonly definition: WorkflowDefinition;
  /**
   * The run to advance. Created by the caller with `newRun`, or reset by
   * `retryFrom` — the caller needs the object anyway for the store, so the engine
   * does not create a second one that could disagree with it.
   *
   * The starting index is derived rather than passed: the first step that is not
   * already `done`. That is 0 for a fresh run and the failed index for a retry,
   * with no parameter to get out of step.
   */
  readonly run: WorkflowRun;
  /**
   * Built per step by the caller — the only side that knows the retriever, the
   * attachments and the user's profile. **Synchronous by construction**:
   * `Retriever.retrieve` is a BM25 pass over an index already in memory, and the
   * one call that can fail (`loadAgentRetriever`) is awaited once, before the run
   * starts.
   */
  readonly systemFor: (step: WorkflowStep, ctx: StepContext) => string;
  readonly call: StepCaller;
  readonly signal?: AbortSignal;
}

/**
 * The outputs of the steps before `index`, keyed by id and also in order.
 *
 * Steps after `index` are absent by construction, not by filtering — which is
 * what assertion C in `scripts/verify-workflow.mts` pins down.
 */
function contextAt(definition: WorkflowDefinition, run: WorkflowRun, index: number): StepContext {
  const outputs = run.steps.slice(0, index).map((step) => ({
    id: step.id,
    label: step.label,
    text: step.text,
  }));

  const prior: Record<string, string> = {};
  for (const output of outputs) prior[output.id] = output.text;

  return { input: run.input, workflowId: definition.id, prior, outputs };
}

export async function* runWorkflow(opts: RunWorkflowOptions): AsyncGenerator<WorkflowEvent> {
  const { definition, systemFor, call, signal } = opts;

  const from = opts.run.steps.findIndex((step) => step.status !== "done");
  if (from === -1) {
    // Every step is already done. Reachable when a caller resumes a finished run;
    // not an error, and not a second model call.
    yield { type: "run-done", run: finishRun(opts.run, "done") };
    return;
  }

  let run = opts.run;

  for (let index = from; index < definition.steps.length; index++) {
    const step = definition.steps[index];
    if (!step) break;

    // Checked *between* steps and not only inside the stream loop. Aborting at
    // the instant a step finishes would otherwise start the next provider call —
    // the user pressed 停止 and got another minute of waiting.
    if (signal?.aborted) {
      const error = appError("ABORTED");
      run = failStep(run, index, error);
      yield { type: "step-error", index, stepId: step.id, error, run };
      yield { type: "run-done", run: finishRun(run, "aborted") };
      return;
    }

    const ctx = contextAt(definition, run, index);
    run = startStep(run, index);
    yield { type: "step-start", index, stepId: step.id, run };

    const request: StepCall = {
      system: systemFor(step, ctx),
      messages: [{ role: "user", content: step.prompt(ctx) }],
      maxTokens: step.maxTokens ?? definition.maxTokensPerStep,
      effort: EFFORT[definition.depth],
    };

    let failure: AppError | null = null;
    let outputTokens: number | undefined;

    for await (const chunk of call(request, signal)) {
      if (chunk.type === "text") {
        // Appended to the run as it arrives, so the step renders as it is written
        // — the same behaviour as a streamed chat answer.
        run = appendText(run, index, chunk.value);
        yield { type: "step-text", index, stepId: step.id, value: chunk.value, run };
      } else if (chunk.type === "usage") {
        outputTokens = chunk.outputTokens;
      } else if (chunk.type === "error") {
        failure = chunk.error;
        break;
      } else if (chunk.type === "done") {
        break;
      }
    }

    if (failure) {
      // `failStep` keeps whatever text arrived. The run stops here: no later step
      // is started, which is what makes `retryFrom` a resume.
      run = failStep(run, index, failure);
      yield { type: "step-error", index, stepId: step.id, error: failure, run };
      // The user's own stop is not a failure to report (see `Workspace.run`).
      yield { type: "run-done", run: finishRun(run, failure.code === "ABORTED" ? "aborted" : "failed") };
      return;
    }

    run = finishStep(run, index, outputTokens);
    yield { type: "step-done", index, stepId: step.id, outputTokens, run };
  }

  yield { type: "run-done", run: finishRun(run, "done") };
}
