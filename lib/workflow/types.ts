/**
 * Workflow types — docs/02_TECH_SPEC.md §10, docs/01_PRD.md §8
 *
 * A workflow is an explicit sequence of typed steps, not a loop. The engine is
 * the only thing that calls the model; a step is a label and a **pure** function
 * that turns the run's context into a prompt.
 *
 * That split is a deliberate departure from §10's sketch, which gives each step a
 * `run(ctx)` method and puts a `gateway: ModelGateway` on the context. Two
 * reasons, and the first is not a preference:
 *
 *   1. `ModelGateway` **is not a type**. `lib/llm/gateway.ts` exports the free
 *      functions `stream` / `generate` / `validate`. §10's sketch cannot be
 *      implemented as written.
 *   2. Even repaired, per-step `run()` would duplicate four things in every step:
 *      `stream()` never throws (a failure arrives as an `error` chunk that has to
 *      be turned into a failure), credentials come from browser storage, the
 *      profile intent has to be resolved, and the abort signal has to be threaded
 *      through and `ABORTED` translated. Four chances per step to get one subtly
 *      wrong — and "preserve the output of steps that already ran" is exactly the
 *      rule that gets written in step 1 and forgotten in step 5.
 *
 * With one call site, F2 (progress), F4 (expand while running), F5 (retry) and
 * F6 (survives a reload) are uniform by construction rather than by discipline.
 *
 * **This file is pure data.** Its one import is type-only, and it deliberately
 * does not import `Effort` or `AgentConfig`: `lib/agents/types.ts` already sets
 * the precedent of declaring its own `ModelProfileId` rather than reusing the
 * equivalent union from `lib/llm/`, and keeping agent config out of `StepContext`
 * is what keeps the import graph acyclic and this module loadable from a Node
 * test.
 */

import type { AppError } from "@/lib/llm/errors";

/**
 * Every workflow the product ships. Typed rather than `string[]` for the same
 * reason `TOOL_IDS` is (lib/tools/types.ts): `AgentConfig.workflows` is declared
 * as `readonly WorkflowId[]` and `lib/workflow/registry.ts` as a total
 * `Record<WorkflowId, WorkflowDefinition>`, so **both** directions of a mistake
 * are compile errors and no runtime validator is needed or wanted.
 *
 * The cost, stated rather than discovered: a closed union means adding a workflow
 * requires a rebuild. Correct for a static export with no runtime plugin surface.
 */
export const WORKFLOW_IDS = ["creator-30day", "office-meeting-summary", "fitness-plan", "travel-itinerary"] as const;

export type WorkflowId = (typeof WORKFLOW_IDS)[number];

export type StepStatus = "pending" | "running" | "done" | "failed";

export type RunStatus = "running" | "done" | "failed" | "aborted";

/**
 * What a step's prompt builder is handed.
 *
 * Note what is *not* here: the agent, the model, credentials, the abort signal,
 * the retrieved knowledge. All of those belong to the one call site that needs
 * them. A step needs the user's ask and what came before it, and nothing else —
 * which is what makes `prompt()` a function that can be called twice for the same
 * answer, and therefore testable.
 */
export interface StepContext {
  /** The user's message. Doubles as the user bubble on restore, and as part of
   *  the retrieval query (see lib/workflow/runner.ts). */
  readonly input: string;
  readonly workflowId: WorkflowId;
  /** Outputs of the steps before this one, keyed by step id. */
  readonly prior: Readonly<Record<string, string>>;
  /** The same, in order, for a prompt that has to say 「第 3 步的输出如下」. */
  readonly outputs: readonly { readonly id: string; readonly label: string; readonly text: string }[];
}

export interface WorkflowStep {
  readonly id: string;
  /** Chinese. The progress row's label, and the result section's heading. */
  readonly label: string;
  /**
   * Pure: no I/O, no clock, no randomness, no model call. Two calls with the same
   * context return the same string — which is what lets the Node test assert on
   * prompt assembly (scripts/verify-workflow.mts, assertion G).
   */
  prompt(ctx: StepContext): string;
  /**
   * A narrower retrieval query, when the step's own prompt is the wrong shape for
   * BM25. Defaults to `input + '\n' + prompt(ctx)`.
   */
  query?(ctx: StepContext): string;
  /** Ceiling for this step, overriding the definition's default. */
  maxTokens?: number;
}

/**
 * How much of the model to spend — docs/02_TECH_SPEC.md §6.4.1, which asks for
 * "high effort for workflow steps". Intent, not a wire parameter: the engine maps
 * it to an `Effort`, and the adapter decides what actually reaches the provider.
 *
 * Spelled in workflow-local vocabulary rather than importing `Effort` so this
 * module stays free of `lib/llm/` at both type and runtime level. The one file
 * that knows both vocabularies is the engine, which is where the mapping belongs.
 */
export type WorkflowDepth = "standard" | "deep";

export interface WorkflowDefinition {
  readonly id: WorkflowId;
  /** Chinese. The ⚡ control's label and the run header. e.g. 30 天内容计划 */
  readonly label: string;
  /** One line, shown when the control is disabled or on hover. */
  readonly description: string;
  readonly depth: WorkflowDepth;
  /**
   * Default ceiling per step. `maxTokens` is a ceiling and not a target — the
   * model stops when it is done — so this is quality control, not cost control:
   * a step that produces a positioning statement must not be handed the same
   * budget as one that produces thirty topics.
   */
  readonly maxTokensPerStep: number;
  readonly steps: readonly WorkflowStep[];
  /**
   * How the finished run becomes one artefact (F8). Not a cosmetic flag:
   *
   *   - `"sections"` — `renderResult` emits `## {step.label}` per finished step,
   *     so `01_PRD.md` §8.2's "all seven must appear as distinct sections" is a
   *     **structural guarantee** rather than a hope about the model's obedience.
   *   - `"document"` — the single step's text is returned unchanged, because its
   *     prompt already owns the section order (§8.3's seven, §8.4's six) and
   *     wrapping it in our own headings would fight it.
   */
  readonly result: "sections" | "document";
}

/**
 * One step's slice of a run. Plain data throughout — including `error`, which is
 * an `AppError` and therefore survives `structuredClone` into IndexedDB and back.
 */
export interface WorkflowStepState {
  readonly id: string;
  /**
   * Copied from the definition when the run is created, not looked up at render
   * time: a definition edited between a run and its reload must not silently
   * relabel history.
   */
  readonly label: string;
  readonly status: StepStatus;
  /** Partial while running, final when done. Cleared only by a retry of the step. */
  readonly text: string;
  /** Present iff `status === "failed"`. */
  readonly error?: AppError;
  readonly outputTokens?: number;
}

export interface WorkflowRun {
  readonly workflowId: WorkflowId;
  /** The user's message. Rendered as the user bubble when a run is restored. */
  readonly input: string;
  /** Epoch ms. A parameter rather than a `Date.now()` call — see lib/workflow/run.ts. */
  readonly startedAt: number;
  readonly status: RunStatus;
  /**
   * Always shaped `[done…, failed?, pending…]`. The engine never advances past a
   * failed step, which is what makes F5's retry a resume rather than a re-run.
   */
  readonly steps: readonly WorkflowStepState[];
}
