/**
 * The client half of the workflow feature — docs/02_TECH_SPEC.md §10
 *
 * `engine.ts` knows the order of the steps and nothing about the world;
 * `runner.ts` knows the world and nothing about the order. This is where the two
 * meet, and it is the only place in the feature that touches `lib/llm`,
 * `lib/rag` and `lib/store` at once.
 *
 * Three decisions live here, and each is stated because the obvious alternative
 * is wrong in a way that only shows up later:
 *
 *   1. **`loadAgentRetriever` is awaited once, before the run starts, inside the
 *      only `try/catch`.** That makes a retrieval failure a property of the
 *      *session* rather than of a step — reported once, in the rail, with the run
 *      carrying on — and it is what lets `systemFor` be synchronous. There is
 *      deliberately no second guard around `retriever.retrieve`: it is a BM25
 *      pass over an index already in memory, it returns `[]` rather than throwing
 *      when nothing matches, and a check that cannot fail is worse than no check.
 *   2. **Every step re-retrieves, with `${input}\n${step.prompt}` as the query.**
 *      Retrieving once for the whole run starves the late steps: step six needs
 *      material about posting cadence that a query of 「我想做一个小红书 AI 科技账号」
 *      does not reach, and the late steps are the ones a user screenshots.
 *      Concatenating the step's own prompt is what puts the concrete subject in
 *      the query, and the user's words supply the platform and the niche that the
 *      step prompt may not restate. `search()` normalises by length, so the query
 *      is bounded to what a person wrote plus one authored string.
 *   3. **Credentials are captured once, when the run starts.** A run is one
 *      decision by the user to wait; re-reading Settings per step would let a
 *      provider change mid-run. The consequence that matters for F5's test —
 *      revoke the key halfway, then retry — is that the failure arrives as the
 *      provider's own 401 rather than as `NO_CREDENTIALS`, which is correct:
 *      the key *was* valid when the run began. Retrying re-enters this function
 *      and captures whatever Settings holds *then*, which is what makes the
 *      retry button work after the user has fixed the key in another tab.
 */

import type { AgentConfig } from "@/lib/agents/types";
import { profileEntries } from "@/lib/agents/profile";
import { isAppError, appError, type AppError } from "@/lib/llm/errors";
import { stream } from "@/lib/llm/gateway";
import type { Credentials } from "@/lib/llm/types";
import { composeSystemPrompt } from "@/lib/rag/context";
import { loadAgentRetriever, type Retriever } from "@/lib/rag/retriever";
import { uploadHits } from "@/lib/rag/uploads";
import type { ProviderSettings } from "@/lib/store/settings";
import { profileSnapshot } from "@/lib/store/memory";
import { commitRun, runSnapshot, setRunNotice } from "@/lib/store/workflow-runs";
import { runWorkflow, type StepCall, type StepCaller } from "@/lib/workflow/engine";
import { getWorkflow } from "@/lib/workflow/registry";
import { failStep, finishRun, newRun } from "@/lib/workflow/run";
import type { StepContext, WorkflowId, WorkflowRun, WorkflowStep } from "@/lib/workflow/types";
import type { Upload } from "@/lib/files/types";

export interface RunRequest {
  readonly agent: AgentConfig;
  readonly settings: ProviderSettings;
  readonly workflowId: WorkflowId;
  /** The message box. May be empty when an attachment carries the task. */
  readonly input: string;
  readonly uploads: readonly Upload[];
  readonly signal: AbortSignal;
  /**
   * Omit to start fresh; pass the output of `retryFrom` to resume.
   *
   * The engine derives its starting index from the first non-`done` step, so a
   * resumed run picks up exactly where the failure was and every earlier step's
   * text is reused rather than re-bought.
   */
  readonly run?: WorkflowRun;
}

/**
 * Drives one run to completion, committing as it goes.
 *
 * Synchronous up to and including the first `commitRun`, so the caller renders
 * the run in the same tick it asked for it — a run that appeared one await later
 * would flash the empty state first.
 */
export async function driveRun(request: RunRequest): Promise<void> {
  const { agent, settings, signal } = request;
  const definition = getWorkflow(request.workflowId);

  let run = request.run ?? newRun(definition, request.input, Date.now());
  commitRun(agent.id, run, "immediate");

  const credentials: Credentials = {
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl.trim() === "" ? undefined : settings.baseUrl.trim(),
    proxyUrl: settings.proxyUrl.trim() === "" ? undefined : settings.proxyUrl.trim(),
  };

  // --- Reference material, resolved once -----------------------------------
  let retriever: Retriever | null = null;
  let retrievalError: AppError | null = null;

  if (agent.knowledgeBase !== null) {
    try {
      retriever = await loadAgentRetriever(agent.id);
    } catch (err) {
      retrievalError = isAppError(err)
        ? err
        : appError("RETRIEVAL_FAILED", err instanceof Error ? err.message : String(err));
    }
  }

  // Reported before the first token rather than after the run: the user is about
  // to wait a minute, and "this answer has no knowledge base behind it" is worth
  // knowing at the start of that wait rather than at the end.
  setRunNotice(agent.id, retrievalError);

  // Read once, at run start, for the same reason as the credentials: the profile
  // is standing context, and a run is one decision. The store is synchronous, so
  // this is the profile as of now with no render in between.
  const snapshot = profileSnapshot(agent.id);
  const profile = snapshot.status === "loading" ? [] : profileEntries(agent.profile, snapshot.fields);

  const systemFor = (step: WorkflowStep, ctx: StepContext): string => {
    const query = step.query?.(ctx) ?? `${ctx.input}\n${step.prompt(ctx)}`;
    const hits = [...uploadHits(request.uploads, query), ...(retriever?.retrieve(query) ?? [])];
    return composeSystemPrompt(agent.systemPrompt, hits, profile);
  };

  /**
   * The production `StepCaller`. Two lines, because `stream()` already promises
   * everything the engine needs: never to throw, and to report a failure as an
   * `error` chunk so partial text survives it.
   */
  const call: StepCaller = (call: StepCall, stepSignal) =>
    stream({
      providerId: settings.providerId,
      credentials,
      model: settings.model,
      profile: agent.modelProfile,
      system: call.system,
      messages: call.messages,
      maxTokens: call.maxTokens,
      // The one caller that sets this. §6.4.1 reserves high effort for workflow
      // steps; a conversation never passes it and keeps its agent's profile.
      effort: call.effort,
      signal: stepSignal,
    });

  try {
    for await (const event of runWorkflow({ definition, run, systemFor, call, signal })) {
      // A run that was cleared mid-flight is not written back. 「清空对话」 aborts
      // the run and drops it in the same tick, but the engine settles the abort
      // asynchronously — without this, the aborted run lands one microtask later
      // and resurrects itself over the record the user just deleted. The store is
      // the only thing that knows a run was cleared, so it is asked rather than
      // duplicated: `loading` is not `null`, so a slow read cannot look like one.
      const current = runSnapshot(agent.id);
      if (current.status === "ready" && current.run === null) return;

      // Step boundaries write immediately and streamed text is coalesced — the
      // schedule is in `lib/store/workflow-runs.ts`, and it is the whole reason
      // `commitRun` takes a mode rather than defaulting one.
      commitRun(agent.id, event.run, event.type === "step-text" ? "coalesced" : "immediate");
      run = event.run;
    }
  } catch (err) {
    // Nothing above is *supposed* to throw: the engine turns provider failures
    // into events, and the one call that can genuinely fail (`loadAgentRetriever`)
    // is caught before the loop starts. What is left is a defect in the
    // synchronous code the engine runs on our behalf — `systemFor`, or a step's
    // own `prompt` — and letting it reject would leave the run stored as
    // `running` with a busy UI that no control can unstick.
    //
    // Settling it here makes the failure look exactly like a mid-run provider
    // failure: prior output kept, an error line on the step, and a retry that
    // resumes from it. The step to blame is the one in flight, or — if the throw
    // happened between two steps — the next one, which is the same rule
    // `restore` uses after a reload and for the same reason.
    const running = run.steps.findIndex((step) => step.status === "running");
    const index = running === -1 ? run.steps.findIndex((step) => step.status === "pending") : running;
    const failure = isAppError(err)
      ? err
      : appError("RETRIEVAL_FAILED", err instanceof Error ? err.message : String(err));
    const settled = index === -1 ? run : failStep(run, index, failure);
    commitRun(agent.id, finishRun(settled, "failed"), "immediate");
  }
}
