/**
 * The workflow engine's Node-checkable half — docs/06_ACCEPTANCE.md F3–F6, F8.
 *
 * Run: npm run verify:workflow
 *
 * **Why this file can exist at all.** `lib/workflow/engine.ts` takes its model
 * call as an injected `StepCaller` instead of importing `lib/llm/gateway.ts`. So
 * this script drives seven steps, a mid-run failure and an abort with a scripted
 * `AsyncGenerator` — no Anthropic SDK, no key, no network, no browser. Under the
 * §10 sketch (a `run(ctx)` method holding a `gateway`) none of that would be
 * reachable from Node, and F5's "a failed stage" would be untestable here.
 *
 * Every check below is paired in a comment with **what to delete to make it go
 * red**, and each must go red *on that check* — an import error is also red and
 * does not count. A check that cannot fail reads as coverage while providing
 * none; `CLAUDE.md` records two occasions where exactly that happened here.
 *
 * What is NOT here, deliberately:
 *
 *   - **Workflow-id resolution** (C4's registry rule). `AgentConfig.workflows` is
 *     `readonly WorkflowId[]` and `WORKFLOW_DEFINITIONS` is
 *     `Record<WorkflowId, WorkflowDefinition>`, so a dangling id is a compile
 *     error in both directions. A runtime check would be unreachable.
 *   - **F7 (Chinese output).** The only Node-checkable premise is that each step's
 *     system prompt is the agent's, which the asset build already guarantees
 *     contains 「中文回答」. That is a structural premise, not a criterion, and
 *     dressing it up as one would be the fake coverage the note above warns about.
 *
 * Covered by hand in a browser instead: F1, F2, F4, F6's reload path, F7, J6, J7.
 * See the "Workflows" column of docs/06_ACCEPTANCE.md.
 */

import { existsSync } from "node:fs";
import * as nodeModule from "node:module";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

// Type-only, so they are erased before Node resolves them. Everything under
// `lib/` is therefore imported dynamically below the hook — a dynamic
// `import()` gives a value, not a namespace, so `types.WorkflowRun` in a type
// position is `TS2503: Cannot find namespace`.
import type { StreamChunk } from "../lib/llm/types.ts";
import type { StepCall, StepCaller, WorkflowEvent } from "../lib/workflow/engine.ts";
import type { StepContext, WorkflowDefinition, WorkflowRun, WorkflowStep } from "../lib/workflow/types.ts";

interface ResolveResult {
  url: string;
  shortCircuit?: boolean;
}
type NextResolve = (specifier: string, context: unknown) => ResolveResult;

/**
 * **Why this is not `import { registerHooks } from "node:module"`.** The runtime
 * is Node 22.17 and `registerHooks` landed in 22.15 — but the repo pins
 * `@types/node@^20`, which predates it. So the function exists and its type does
 * not, and the plain named import is a compile error against a program that runs.
 * One assertion, in one place, with this comment; same as `verify-upload.mts`.
 */
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => ResolveResult;
  }) => void;
};

const ROOT = resolvePath(process.cwd());
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolvePath(ROOT, specifier.slice(2));
      // Extension probing, because the repo writes internal imports without one
      // (`@/lib/llm/errors`) and Node does not resolve that the way TS does.
      for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const run = await import("../lib/workflow/run.ts");
const registry = await import("../lib/workflow/registry.ts");
const engine = await import("../lib/workflow/engine.ts");

const INPUT = "我想做一个小红书 AI 科技账号";
const T0 = 1_700_000_000_000;

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

function section(name: string): void {
  console.log(`\n${name}`);
}

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// The scripted caller
// ---------------------------------------------------------------------------

interface CallLog {
  system: string;
  prompt: string;
  maxTokens: number;
  effort: string;
}

interface CtxLog {
  stepId: string;
  ctx: StepContext;
}

interface Harness {
  run: WorkflowRun;
  events: WorkflowEvent[];
  calls: CallLog[];
  ctxs: CtxLog[];
  /** What each call was handed as its abort signal. */
  signals: (AbortSignal | undefined)[];
  eventTypes: string[];
}

interface DriveOptions {
  /** The chunks call `n` produces. */
  script: (n: number, prompt: string) => StreamChunk[];
    /**
   * Runs after call `n`'s chunks are exhausted — used to abort between steps.
   *
   * **It only runs if the generator was allowed to finish.** The engine `break`s
   * on a `done` chunk, and `break` calls `generator.return()`, which unwinds the
   * generator at its current `yield` — so anything written below the last yield
   * is skipped. A script that ends with `DONE` therefore never reaches this
   * hook; to use it, end the call's chunks without one, as the abort check does.
   */
  after?: (n: number) => void;
  signal?: AbortSignal;
  /** Defaults to a fresh run of `definition`. */
  run?: WorkflowRun;
}

/**
 * Drives one run to completion and records everything an assertion could want.
 *
 * `systemFor` is the hook for `ctx`, because it is the one callback the engine
 * hands the same `StepContext` it built the request from — so what is recorded
 * here is exactly what the model call saw, not a reconstruction of it.
 */
async function drive(definition: WorkflowDefinition, options: DriveOptions): Promise<Harness> {
  const calls: CallLog[] = [];
  const ctxs: CtxLog[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const events: WorkflowEvent[] = [];
  let n = 0;

  const call: StepCaller = async function* (request: StepCall, signal) {
    const index = n++;
    const prompt = request.messages[0]?.content ?? "";
    calls.push({
      system: request.system,
      prompt,
      maxTokens: request.maxTokens,
      effort: request.effort,
    });
    signals.push(signal);
    for (const chunk of options.script(index, prompt)) yield chunk;
    options.after?.(index);
  };

  const systemFor = (step: WorkflowStep, ctx: StepContext): string => {
    ctxs.push({ stepId: step.id, ctx });
    return `SYS:${step.id}`;
  };

  const start = options.run ?? run.newRun(definition, INPUT, T0);
  for await (const event of engine.runWorkflow({ definition, run: start, systemFor, call, signal: options.signal })) {
    events.push(event);
  }

  return {
    run: events[events.length - 1]!.run,
    events,
    calls,
    ctxs,
    signals,
    eventTypes: events.map((event) => event.type),
  };
}

const TEXT = (value: string): StreamChunk => ({ type: "text", value });
const USAGE: StreamChunk = { type: "usage", inputTokens: 10, outputTokens: 20 };
const DONE: StreamChunk = { type: "done" };
const ok = (value: string): StreamChunk[] => [TEXT(value), USAGE, DONE];

const creator = registry.WORKFLOW_DEFINITIONS["creator-30day"];
const office = registry.WORKFLOW_DEFINITIONS["office-meeting-summary"];
const fitness = registry.WORKFLOW_DEFINITIONS["fitness-plan"];

// ---------------------------------------------------------------------------
section("A · F3 — creator-30day is the seven-stage workflow, with the spec's labels");
// ---------------------------------------------------------------------------

// Red if: delete `steps[6]` (the count), or rename any label (the verbatim list).
// The seven strings are copied from docs/03_UI_UX_SPEC.md §7 on purpose — this
// list is the independent second copy, so a rename in the definition cannot
// quietly rename a section of the finished artefact.
const SEVEN = [
  "分析账号定位",
  "定义目标受众",
  "设计内容支柱",
  "生成 30 个选题",
  "生成标题",
  "生成发布日历",
  "增长建议",
];

check("exactly seven steps", creator.steps.length === 7, String(creator.steps.length));
check("the labels are the spec's, verbatim", eq(creator.steps.map((s) => s.label), SEVEN), JSON.stringify(creator.steps.map((s) => s.label)));
check("the last is 增长建议", creator.steps[6]?.label === "增长建议");
check("result is sections", creator.result === "sections");
check("depth is deep", creator.depth === "deep");
check("ids are unique", new Set(creator.steps.map((s) => s.id)).size === 7);
check("labels are unique", new Set(creator.steps.map((s) => s.label)).size === 7);
check("every prompt is non-empty", creator.steps.every((s) => s.prompt({ input: INPUT, workflowId: "creator-30day", prior: {}, outputs: [] }).length > 0));

// ---------------------------------------------------------------------------
section("A2 · every registered definition is well-formed");
// ---------------------------------------------------------------------------

// Red if: empty `steps` on any definition. A definition with no steps would
// produce a run that is `done` before it starts and a `renderResult` of "" —
// the user presses ⚡ and gets nothing, with no error to explain it.
for (const definition of Object.values(registry.WORKFLOW_DEFINITIONS)) {
  check(`${definition.id} has at least one step`, definition.steps.length >= 1);
  check(`${definition.id} has a label`, definition.label.length > 0);
  check(`${definition.id} has a description`, definition.description.length > 0);
  check(`${definition.id} step ids are unique`, new Set(definition.steps.map((s) => s.id)).size === definition.steps.length);
  check(`${definition.id} maxTokensPerStep is positive`, definition.maxTokensPerStep > 0);
}

check("office is a one-step document", office.steps.length === 1 && office.result === "document");
check("fitness is a one-step document", fitness.steps.length === 1 && fitness.result === "document");
check("the two single-step ids are the ones the plan named", office.steps[0]?.id === "summary" && fitness.steps[0]?.id === "plan");

// ---------------------------------------------------------------------------
section("B · F5 — retryFrom reuses what is above it and resets what is not");
// ---------------------------------------------------------------------------

let staged = run.newRun(creator, INPUT, T0);
for (let i = 0; i < 4; i++) {
  staged = run.startStep(staged, i);
  staged = run.appendText(staged, i, `out-${i}`);
  staged = run.finishStep(staged, i);
}
staged = run.startStep(staged, 4);
staged = run.appendText(staged, 4, "half a sentence");
staged = run.failStep(staged, 4, { code: "RATE_LIMITED", message: "请求太频繁了。" });
staged = run.finishRun(staged, "failed");

const retried = run.retryFrom(staged, 3);

// Red if: retryFrom maps over every step instead of `i < index ? step : …`.
check("prior steps are the same objects", [0, 1, 2].every((i) => retried.steps[i] === staged.steps[i]));
check("prior steps keep their text", [0, 1, 2].every((i) => retried.steps[i]?.text === `out-${i}`));
check("the retried step is pending", retried.steps[3]?.status === "pending");
check("the retried step is emptied", retried.steps[3]?.text === "");
check("the failed step is reset too", retried.steps[4]?.status === "pending" && retried.steps[4]?.text === "");
check("later steps are reset", [5, 6].every((i) => retried.steps[i]?.status === "pending" && retried.steps[i]?.text === ""));
check("the run is running again", retried.status === "running");

// Red if: retryFrom writes `{ ...step, error: undefined }`. That leaves `error`
// as an own property holding `undefined` — `structuredClone` preserves it, and
// it would be persisted to IndexedDB as a key that exists and holds nothing.
check(
  "a reset step has exactly four own keys, no `error`",
  eq(Object.keys(retried.steps[3] ?? {}).sort(), ["id", "label", "status", "text"]),
  JSON.stringify(Object.keys(retried.steps[3] ?? {})),
);

// The engine derives its starting index from this shape rather than taking a
// parameter, so "resume from the failed step" is the array's own answer.
check("the engine would resume at index 3", retried.steps.findIndex((s) => s.status !== "done") === 3);

// ---------------------------------------------------------------------------
section("B2 · §10 — a failure keeps the text it streamed, and stops the run");
// ---------------------------------------------------------------------------

const boom: StreamChunk = { type: "error", error: { code: "RATE_LIMITED", message: "请求太频繁了。" } };
const failedRun = await drive(creator, {
  script: (n) => (n === 0 ? [TEXT("abc"), TEXT("def"), boom] : ok(`<${n}>`)),
});

// Red if: failStep clears `text`. That is §10's "never discard work the user
// paid for" — 900 streamed tokens must survive the rate limit that ended them.
check("the failed step keeps every token it streamed", failedRun.run.steps[0]?.text === "abcdef", failedRun.run.steps[0]?.text);
check("the failed step is marked failed", failedRun.run.steps[0]?.status === "failed");
check("the error is the provider's", failedRun.run.steps[0]?.error?.code === "RATE_LIMITED");
check("the run is failed", failedRun.run.status === "failed");
check("no later step is started", failedRun.calls.length === 1, String(failedRun.calls.length));
check(
  "no event mentions a later step",
  failedRun.events.every((event) => !("index" in event) || event.index === 0),
  JSON.stringify(failedRun.eventTypes),
);
check("the run ends with run-done", failedRun.eventTypes[failedRun.eventTypes.length - 1] === "run-done");

// The user's own stop arrives as an ABORTED error chunk. It must settle the run
// as `aborted`, not `failed` — the UI shows a neutral marker for it, and a
// failure marker for everything else (03_UI_UX_SPEC.md §2 keeps --danger for
// genuine faults; `Workspace.run` already draws that line for chat).
const abortedChunk = await drive(creator, {
  script: (n) => (n === 0 ? [TEXT("half"), { type: "error", error: { code: "ABORTED", message: "已取消。" } }] : ok(`<${n}>`)),
});
check("an ABORTED chunk settles the run as aborted", abortedChunk.run.status === "aborted", abortedChunk.run.status);
check("and keeps its partial text", abortedChunk.run.steps[0]?.text === "half");

// ---------------------------------------------------------------------------
section("C · the full seven-step sequence, and what each step is handed");
// ---------------------------------------------------------------------------

const full = await drive(creator, { script: (n) => ok(`<${n}>`) });

check("the caller was invoked seven times", full.calls.length === 7, String(full.calls.length));
check(
  "each step emits start → text → done, in order",
  eq(full.eventTypes, [
    "step-start", "step-text", "step-done",
    "step-start", "step-text", "step-done",
    "step-start", "step-text", "step-done",
    "step-start", "step-text", "step-done",
    "step-start", "step-text", "step-done",
    "step-start", "step-text", "step-done",
    "step-start", "step-text", "step-done",
    "run-done",
  ]),
  JSON.stringify(full.eventTypes),
);
check("the run is done", full.run.status === "done");
check("every step is done", full.run.steps.every((s) => s.status === "done"));
check("the steps carry their own outputs", eq(full.run.steps.map((s) => s.text), ["<0>", "<1>", "<2>", "<3>", "<4>", "<5>", "<6>"]));

// Red if: the loop continues after `step-error` (then a later step would appear
// in `ctxs`), or `contextAt` slices the wrong way and leaks a later output.
check("the first step sees no prior output", full.ctxs[0]?.ctx.outputs.length === 0);
check("the first step's prior map is empty", eq(full.ctxs[0]?.ctx.prior, {}));
check("the second step sees exactly the first", eq(Object.keys(full.ctxs[1]?.ctx.prior ?? {}), ["positioning"]));
check(
  "step N sees exactly steps 0..N-1, and nothing later",
  full.ctxs.every((entry, index) => eq(Object.keys(entry.ctx.prior), creator.steps.slice(0, index).map((s) => s.id))),
  JSON.stringify(full.ctxs.map((entry) => Object.keys(entry.ctx.prior).length)),
);
check("the seventh step sees six outputs", full.ctxs[6]?.ctx.outputs.length === 6);
check("prior text is the real output, not a placeholder", full.ctxs[6]?.ctx.prior["titles"] === "<4>");
check("every step's ctx carries the user's input", full.ctxs.every((entry) => entry.ctx.input === INPUT));
check("the ctxs are in definition order", eq(full.ctxs.map((entry) => entry.stepId), creator.steps.map((s) => s.id)));

// Per-step depth and ceiling — 02_TECH_SPEC.md §6.4.1 and §4.5 of the plan.
check("every step runs at high effort", full.calls.every((c) => c.effort === "high"));
check(
  "each step's ceiling is its own, falling back to the definition's",
  eq(full.calls.map((c) => c.maxTokens), creator.steps.map((s) => s.maxTokens)),
  JSON.stringify(full.calls.map((c) => c.maxTokens)),
);
check("the two big steps are the ones with the big ceilings", full.calls[3]?.maxTokens === 8000 && full.calls[5]?.maxTokens === 8000);
check("the system prompt is the step's", eq(full.calls.map((c) => c.system), creator.steps.map((s) => `SYS:${s.id}`)));

// ---------------------------------------------------------------------------
section("C2 · abort — F5's stop button, and the check between steps");
// ---------------------------------------------------------------------------

const preAborted = new AbortController();
preAborted.abort();

const stopped = await drive(creator, { script: (n) => ok(`<${n}>`), signal: preAborted.signal });

// Red if: delete the `signal.aborted` check at the top of the engine's loop.
check("a pre-aborted signal calls no model", stopped.calls.length === 0, String(stopped.calls.length));
check("it settles the run as aborted", stopped.run.status === "aborted", stopped.run.status);
check("the first step is the failure", stopped.run.steps[0]?.status === "failed");
check("the failure is ABORTED", stopped.run.steps[0]?.error?.code === "ABORTED");
check("nothing after it is touched", stopped.run.steps.slice(1).every((s) => s.status === "pending"));
check(
  "exactly two events, and no more",
  eq(stopped.eventTypes, ["step-error", "run-done"]),
  JSON.stringify(stopped.eventTypes),
);

// The case the between-step check actually exists for: the user presses stop at
// the instant step 0 finishes. Without it, step 1's call starts anyway and the
// user who asked to stop is handed another forty seconds of waiting.
// Note the missing `DONE` on call 0: see the note on `DriveOptions.after`. The
// stream simply ends, which is what lets `after` run and press stop at exactly
// the moment the engine is between two steps.
const between = new AbortController();
const stoppedBetween = await drive(creator, {
  script: (n) => (n === 0 ? [TEXT("<0>"), USAGE] : ok(`<${n}>`)),
  after: (n) => {
    if (n === 0) between.abort();
  },
  signal: between.signal,
});

// Red if: move the `signal.aborted` check inside the stream loop only.
check("the finished step is still counted", stoppedBetween.calls.length === 1, String(stoppedBetween.calls.length));
check("the step that had finished is done", stoppedBetween.run.steps[0]?.status === "done");
check("the step that was about to start is the failure", stoppedBetween.run.steps[1]?.status === "failed");
check("and it is ABORTED", stoppedBetween.run.steps[1]?.error?.code === "ABORTED");
check("the run is aborted, not failed", stoppedBetween.run.status === "aborted");
check("nothing beyond it ran", stoppedBetween.run.steps.slice(2).every((s) => s.status === "pending"));
// Red if: the engine calls `call(request)` without forwarding its signal. Then
// stop would never reach the provider, and a step would run to completion after
// the user pressed stop — the failure the between-step check alone cannot see,
// because that check is the engine's own.
check("the engine forwards its signal to the provider call", stoppedBetween.signals[0] === between.signal);
check(
  "the sequence ends at the failure",
  eq(stoppedBetween.eventTypes, ["step-start", "step-text", "step-done", "step-error", "run-done"]),
  JSON.stringify(stoppedBetween.eventTypes),
);

// ---------------------------------------------------------------------------
section("D · F6 — restore, the reload rule (the highest-value check here)");
// ---------------------------------------------------------------------------

let interrupted = run.newRun(creator, INPUT, T0);
for (let i = 0; i < 2; i++) {
  interrupted = run.startStep(interrupted, i);
  interrupted = run.appendText(interrupted, i, `kept-${i}`);
  interrupted = run.finishStep(interrupted, i);
}
interrupted = run.startStep(interrupted, 2);
interrupted = run.appendText(interrupted, 2, "partial third step");

const restored = run.restore(interrupted);

// Red if: restore resets the steps it did not have to touch. Everything below
// the interrupted step is text the user already paid for, and it must come back
// from IndexedDB byte-identical.
check("the run is settled as aborted", restored.status === "aborted", restored.status);
check("the interrupted step is a failure", restored.steps[2]?.status === "failed");
check("its error is ABORTED", restored.steps[2]?.error?.code === "ABORTED");
check("its message says what happened, not 已取消", restored.steps[2]?.error?.message === "页面刷新后运行中断了。", restored.steps[2]?.error?.message);
check("the partial text of the interrupted step survives", restored.steps[2]?.text === "partial third step");
check("the finished steps are the same objects", [0, 1].every((i) => restored.steps[i] === interrupted.steps[i]));
check("the finished steps keep their text", [0, 1].every((i) => restored.steps[i]?.text === `kept-${i}`));
check("the steps that never ran are untouched", [3, 4, 5, 6].every((i) => restored.steps[i] === interrupted.steps[i]));
check("the input is untouched", restored.input === INPUT);

// "Interrupted by a reload" and "failed mid-run" are deliberately the same state,
// so the failed row's existing retry (F5) is a retry that works after a reload.
const afterReload = run.retryFrom(restored, restored.steps.findIndex((s) => s.status === "failed"));
check("the reload leaves exactly one retry point", afterReload.steps.findIndex((s) => s.status !== "done") === 2);

// A run that had already settled is returned as-is — same object, so nothing
// downstream can observe a copy.
const settled = run.finishRun(full.run, "done");
check("a settled run is returned unchanged", run.restore(settled) === settled);

// The page died between two steps, so nothing is marked `running` yet. Without
// the fall-through to the first pending step, the run would settle with no
// retry anywhere and starting over would be the only way forward.
const betweenSteps = run.newRun(creator, INPUT, T0);
const restoredBetween = run.restore(betweenSteps);
check("a run interrupted before step 0 still offers a retry", restoredBetween.steps[0]?.status === "failed");
check("and it is aborted", restoredBetween.status === "aborted");

// Every step done but the status never settled (the tab died between the last
// `step-done` and `run-done`). Nothing to fail, nothing to retry.
const allDoneButRunning = run.finishRun(full.run, "running");
const restoredAllDone = run.restore(allDoneButRunning);
check("a run with nothing left aborts without inventing a failure", restoredAllDone.status === "aborted" && restoredAllDone.steps.every((s) => s.status === "done"));

// ---------------------------------------------------------------------------
section("E · the store's read guard");
// ---------------------------------------------------------------------------

const goodRecord = { agentId: "creator", schemaVersion: run.RUN_SCHEMA_VERSION, updatedAt: T0, run: full.run };

check("a well-formed record is accepted", run.isUsableRunRecord(goodRecord));
// Red if: relax the comparison to `typeof === "number"`. Version 2 would then be
// accepted and rendered as a shape this build does not understand — the exact
// failure the field exists to prevent.
check("version 2 is rejected", !run.isUsableRunRecord({ ...goodRecord, schemaVersion: 2 }));
check("a string version is rejected", !run.isUsableRunRecord({ ...goodRecord, schemaVersion: "1" }));
check("a missing version is rejected", !run.isUsableRunRecord({ ...goodRecord, schemaVersion: undefined }));
check("a non-object is rejected", !run.isUsableRunRecord(null) && !run.isUsableRunRecord("run") && !run.isUsableRunRecord(42));
check("a missing agentId is rejected", !run.isUsableRunRecord({ ...goodRecord, agentId: undefined }));
// Red if: drop `Array.isArray(run.steps)` from `isRun`.
check("a run whose steps are not an array is rejected", !run.isUsableRunRecord({ ...goodRecord, run: { ...full.run, steps: {} } }));
check("a step with a non-string text is rejected", !run.isUsableRunRecord({ ...goodRecord, run: { ...full.run, steps: [{ id: "a", label: "b", status: "done", text: 7 }] } }));
check("an unknown step status is rejected", !run.isUsableRunRecord({ ...goodRecord, run: { ...full.run, steps: [{ id: "a", label: "b", status: "exploded", text: "" }] } }));
check("an unknown run status is rejected", !run.isUsableRunRecord({ ...goodRecord, run: { ...full.run, status: "exploded" } }));
// Red if: relax `WORKFLOW_IDS.includes` to `typeof === "string"`. A run naming a
// workflow this build cannot render would be restored into a view with no
// definition to render it against.
check("a run naming an unknown workflow is rejected", !run.isUsableRunRecord({ ...goodRecord, run: { ...full.run, workflowId: "creator-60day" } }));
check("a run with no startedAt is rejected", !run.isUsableRunRecord({ ...goodRecord, run: { ...full.run, startedAt: undefined } }));

// IndexedDB structured-clones what it stores, so an AppError that does not
// survive the round trip comes back as a broken row — a failure the user sees
// once and cannot reproduce by reading the code.
const cloned = structuredClone(staged);
check("a failed run survives structuredClone", eq(cloned, staged));
check("including its error", eq(cloned.steps[4]?.error, { code: "RATE_LIMITED", message: "请求太频繁了。" }));
check("and a record around it", run.isUsableRunRecord(structuredClone(goodRecord)));

// ---------------------------------------------------------------------------
section("F · F8's structural half — renderResult");
// ---------------------------------------------------------------------------

const rendered = run.renderResult(creator, full.run);
const headings = rendered.split("\n").filter((line) => line.startsWith("## "));

// Red if: join the sections with a comma, or drop the `## ` prefix. §8.2 requires
// all seven stages to appear as distinct sections, and this is what makes that
// structural rather than a hope that the model obeyed.
check("seven headings", headings.length === 7, String(headings.length));
check("the headings are the seven labels, in order", eq(headings, SEVEN.map((label) => `## ${label}`)));
check("the last heading is 增长建议", headings[6] === "## 增长建议");
check("each section carries its step's text", rendered.includes("<3>") && rendered.includes("<6>"));
check("the first section starts the document", rendered.startsWith("## 分析账号定位"));

// A partly-finished artefact renders the stages that exist. Rendering the
// pending ones would print seven empty headings over an error.
const partial = run.renderResult(creator, staged);
check("a failed run renders only the stages that finished", (partial.match(/^## /gm) ?? []).length === 4, String((partial.match(/^## /gm) ?? []).length));
check("and it does not render the failed stage's heading", !partial.includes("## 生成标题"));

// `"document"` is byte-for-byte the step's text — the section names already
// belong to `prompts/office.md`, and a second copy here would give one expert
// two output formats that drift apart.
let summaryRun = run.newRun(office, "一份会议录音转写", T0);
summaryRun = run.startStep(summaryRun, 0);
summaryRun = run.appendText(summaryRun, 0, "## 一句话摘要\n\n会上定了三件事。");
summaryRun = run.finishStep(summaryRun, 0);
const document = run.renderResult(office, summaryRun);
check("a document run is returned unchanged", document === summaryRun.steps[0]?.text);
check("and no heading of ours is added", !document.startsWith("## 整理纪要"));

// ---------------------------------------------------------------------------
section("G · the step prompts");
// ---------------------------------------------------------------------------

// Red if: `prompt` returns `ctx.input` — then all seven are identical, and every
// one of them fails the "carries its own instruction" half below.
check("seven distinct prompts", new Set(full.calls.map((c) => c.prompt)).size === 7, String(new Set(full.calls.map((c) => c.prompt)).size));

// Red if: drop `${ask(ctx)}` from any step.
check("every step quotes the user's own words", full.calls.every((c) => c.prompt.includes(INPUT)));

// Red if: drop `priorOutputs` from the second step, or add it to the first.
check("the first step is not handed a prior-output block", !full.calls[0]?.prompt.includes("前面几步已经产出的内容："));
check("the second step is", full.calls[1]?.prompt.includes("前面几步已经产出的内容："));
check("and the block is the first step's real output", full.calls[1]?.prompt.includes("<0>"));

// Red if: `contextAt` were given the whole run instead of a slice — step 7 would
// then be shown its own answer as if it were an input.
check("no step is handed its own output", full.calls.every((c, i) => !c.prompt.includes(`<${i}>`)));
check("the last step sees the sixth's output", full.calls[6]?.prompt.includes("<5>"));

// The one instruction that makes `result: "sections"` work. Without it a model
// prefixes its answer with a heading of its own devising and the artefact ends
// up with two headings per section, worded differently.
check("each multi-step section asks for a body, not a heading", full.calls.every((c) => c.prompt.includes("不要写标题")));

// The checks above all read the flagship. A one-step definition has exactly one
// chance to say the user's words, and nothing above would notice if it forgot —
// so every registered definition is driven once here, including the two that
// are a single call.
for (const definition of Object.values(registry.WORKFLOW_DEFINITIONS)) {
  const solo = await drive(definition, { script: (n) => ok(`<${n}>`) });
  check(`${definition.id} quotes the user's own words`, solo.calls.every((c) => c.prompt.includes(INPUT)));
  check(`${definition.id} gives every step a real prompt`, solo.calls.every((c) => c.prompt.length > 50));
  check(`${definition.id} reaches run-done`, solo.run.status === "done", solo.run.status);
  check(`${definition.id} produces one rendered result`, run.renderResult(definition, solo.run).length > 0);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("all green");
console.log(
  "\nThis covers the engine, the run's transitions and the artefact's structure.\n" +
    "What needs a browser is listed at the end of docs/06_ACCEPTANCE.md §F:\n" +
    "F1, F2, F4, F6's reload path, F7, J6 and J7.\n",
);
