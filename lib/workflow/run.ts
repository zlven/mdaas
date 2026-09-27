/**
 * Pure transitions over a `WorkflowRun` — docs/02_TECH_SPEC.md §9, §10
 *
 * Every function here is total, side-effect free, and free of a clock: dates are
 * parameters, never `Date.now()`. That is not stylistic. It is what lets
 * `scripts/verify-workflow.mts` prove the run's rules — retry reuses, restore
 * preserves, a failure never advances — without a browser, a provider, or a
 * fake timer. The engine and the store both call into this file and own the I/O;
 * nothing here does any.
 *
 * The invariant the whole feature rests on: **a run's steps are always shaped
 * `[done…, failed?, pending…]`.** The engine never advances past a failed step.
 * Every rule below is a consequence — retry is a resume rather than a re-run, and
 * "what happens to the steps after the one that failed" has no answer to compute
 * because they never ran.
 */

import { appError, type AppError } from "@/lib/llm/errors";

import { WORKFLOW_IDS, type WorkflowDefinition, type WorkflowRun, type WorkflowStepState } from "@/lib/workflow/types";

/**
 * Bumped when the persisted shape changes. A record that does not match is
 * discarded rather than migrated (docs/02_TECH_SPEC.md §9: "on mismatch, discard
 * rather than attempt migration. This is a demo.").
 */
export const RUN_SCHEMA_VERSION = 1;

export interface WorkflowRunRecord {
  readonly agentId: string;
  readonly schemaVersion: number;
  readonly updatedAt: number;
  readonly run: WorkflowRun;
}

/**
 * What a step says when the page went away underneath it.
 *
 * `appError` already carries a message for `ABORTED` 「已取消。」 which is true but
 * reads as if the user had pressed stop. They did not — they reloaded. Overriding
 * the message here rather than adding an `ErrorCode` keeps §6.5's table and the
 * PRD §9 row unchanged.
 */
function interruptedError(): AppError {
  return appError("ABORTED", "page reloaded mid-run", { message: "页面刷新后运行中断了。" });
}

function stepAt(run: WorkflowRun, index: number): WorkflowStepState | undefined {
  return run.steps[index];
}

/** Replaces one step, leaving every other step the same object. */
function withStep(run: WorkflowRun, index: number, next: WorkflowStepState): WorkflowRun {
  return { ...run, steps: run.steps.map((step, i) => (i === index ? next : step)) };
}

export function newRun(definition: WorkflowDefinition, input: string, startedAt: number): WorkflowRun {
  return {
    workflowId: definition.id,
    input,
    startedAt,
    status: "running",
    steps: definition.steps.map((step) => ({
      id: step.id,
      // Copied, not referenced — see the note on `WorkflowStepState.label`.
      label: step.label,
      status: "pending",
      text: "",
    })),
  };
}

/** The step is now the one in flight. The engine emits this before its first token. */
export function startStep(run: WorkflowRun, index: number): WorkflowRun {
  const step = stepAt(run, index);
  if (!step) return run;
  return withStep(run, index, { ...step, status: "running", text: "" });
}

/**
 * Appends a streamed token.
 *
 * Called once per token so React can render the step as it is written, exactly as
 * it renders a chat answer. The *store* coalesces its writes; this function is
 * deliberately the cheap in-memory half of that split.
 */
export function appendText(run: WorkflowRun, index: number, value: string): WorkflowRun {
  const step = stepAt(run, index);
  if (!step) return run;
  return withStep(run, index, { ...step, text: step.text + value });
}

export function finishStep(run: WorkflowRun, index: number, outputTokens?: number): WorkflowRun {
  const step = stepAt(run, index);
  if (!step) return run;
  return withStep(run, index, { ...step, status: "done", outputTokens });
}

/**
 * The step failed. **Its text is kept.**
 *
 * §10: "Never discard work the user paid for." A step that streamed 900 tokens
 * and then hit a rate limit leaves those 900 tokens on screen and expandable,
 * with the error and the retry beneath them.
 */
export function failStep(run: WorkflowRun, index: number, error: AppError): WorkflowRun {
  const step = stepAt(run, index);
  if (!step) return run;
  return withStep(run, index, { ...step, status: "failed", error });
}

export function finishRun(run: WorkflowRun, status: WorkflowRun["status"]): WorkflowRun {
  return { ...run, status };
}

/**
 * Resets step `index` and everything after it, so the engine can run forward from
 * there. Steps before `index` are returned as **the same objects** — same text,
 * same status — which is F5's "preserving prior stages' output" expressed as an
 * identity rather than as a copy that might drift.
 *
 * Note the fresh object literal for the reset steps rather than
 * `{ ...step, error: undefined }`: the latter leaves `error` as an own property
 * whose value is `undefined`, which `structuredClone` preserves and which would
 * then be written to IndexedDB as a key that exists and holds nothing.
 */
export function retryFrom(run: WorkflowRun, index: number): WorkflowRun {
  return {
    ...run,
    status: "running",
    steps: run.steps.map((step, i) =>
      i < index ? step : { id: step.id, label: step.label, status: "pending" as const, text: "" },
    ),
  };
}

/**
 * The reload rule — F6.
 *
 * If the run had already settled, it is returned unchanged. If it was still
 * `running`, the page went away: there is no live request to resume, so the run
 * is settled as `aborted` and the interrupted step becomes a failure. Every step
 * that finished keeps its text verbatim.
 *
 * The point of settling it this way is that **"interrupted by a reload" and
 * "failed mid-run" are the same UI state**, so F6 needs no component of its own:
 * the failed row already carries the error line, the preserved outputs above it
 * and — because `retryFrom` resumes from that index — a retry control that
 * genuinely works after a reload.
 */
export function restore(run: WorkflowRun): WorkflowRun {
  if (run.status !== "running") return run;

  const interrupted = run.steps.findIndex((step) => step.status === "running");
  // Normally the page died mid-step and exactly one step is `running`. It can
  // also die between two steps, where nothing is marked yet — in that case the
  // step the engine would have started next is the one to offer a retry on.
  // Falling through to `-1` there would produce a settled run with no retry at
  // all, and starting over would be the only way forward.
  const target = interrupted === -1 ? run.steps.findIndex((step) => step.status === "pending") : interrupted;

  if (target === -1) return { ...run, status: "aborted" };

  const error = interruptedError();
  const steps = run.steps.map((step, i) => (i === target ? { ...step, status: "failed" as const, error } : step));
  return { ...run, status: "aborted", steps };
}

/**
 * The finished run as one artefact — F8.
 *
 * For `"sections"`, the headings are ours: `01_PRD.md` §8.2 requires all seven to
 * appear as distinct sections, and emitting them here makes that structural
 * rather than a hope that the model obeyed. A model that answers in prose still
 * yields seven headed sections; worse content is a prompt problem, not a
 * structure problem.
 */
export function renderResult(definition: WorkflowDefinition, run: WorkflowRun): string {
  if (definition.result === "document") return run.steps[0]?.text ?? "";

  return run.steps
    .filter((step) => step.status === "done")
    .map((step) => `## ${step.label}\n\n${step.text}`)
    .join("\n\n");
}

const RUN_STATUSES: readonly string[] = ["running", "done", "failed", "aborted"];
const STEP_STATUSES: readonly string[] = ["pending", "running", "done", "failed"];

function isStepState(value: unknown): value is WorkflowStepState {
  if (typeof value !== "object" || value === null) return false;
  const step = value as Partial<WorkflowStepState>;
  return (
    typeof step.id === "string" &&
    typeof step.label === "string" &&
    typeof step.text === "string" &&
    STEP_STATUSES.includes(step.status as string)
  );
}

function isRun(value: unknown): value is WorkflowRun {
  if (typeof value !== "object" || value === null) return false;
  const run = value as Partial<WorkflowRun>;
  return (
    typeof run.input === "string" &&
    typeof run.startedAt === "number" &&
    RUN_STATUSES.includes(run.status as string) &&
    // Membership, not just `typeof === "string"`: a run naming a workflow this
    // build cannot render would otherwise be restored into a view with no
    // definition to render it against.
    WORKFLOW_IDS.includes(run.workflowId as never) &&
    Array.isArray(run.steps) &&
    run.steps.every(isStepState)
  );
}

/**
 * The store's read guard. A record that fails any of these is discarded, which is
 * the same posture `lib/store/memory.ts` takes for a `schemaVersion` mismatch.
 *
 * `schemaVersion` is compared for equality rather than merely type-checked. A
 * `typeof === "number"` check would accept version 2 and then render a shape this
 * build does not understand — which is the failure the field exists to prevent.
 */
export function isUsableRunRecord(value: unknown): value is WorkflowRunRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<WorkflowRunRecord>;
  return (
    typeof record.agentId === "string" &&
    record.schemaVersion === RUN_SCHEMA_VERSION &&
    typeof record.updatedAt === "number" &&
    isRun(record.run)
  );
}
