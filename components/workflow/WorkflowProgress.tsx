"use client";

import { WorkflowStepRow } from "@/components/workflow/WorkflowStepRow";
import type { WorkflowRun } from "@/lib/workflow/types";

/**
 * The ordered step list — docs/03_UI_UX_SPEC.md §7, docs/06_ACCEPTANCE.md F2, J7
 *
 * An `<ol>` because the order is the feature: step five reads step four's output,
 * so "which step is this" is not decoration. The numbering itself is drawn by the
 * markers rather than by `list-decimal`, so the list is stripped of its markers
 * and the rule connecting them is a border on each row's first column.
 *
 * **The live region is a separate `sr-only` paragraph, not the list.** Putting
 * `aria-live` on the `<ol>` would make every change re-announce the whole table —
 * every label, twice a second while a step streams — which is precisely why
 * `Workspace` puts its live region on the answer being written rather than on the
 * conversation. One short sentence per state change is the whole requirement.
 */

/**
 * What a screen reader hears.
 *
 * Written as a function of the run rather than fired from an effect on each
 * transition, so it is a pure value React diffs: while a step streams, the run
 * object changes on every token but this string does not, so there is no DOM
 * mutation and nothing is re-announced. That is the behaviour J7 asks for and it
 * falls out of computing rather than publishing.
 *
 * The finished-step clause is what makes the announcement useful: "正在运行：第 4
 * 步" alone tells a listener where they are but not that anything was produced.
 */
function announcement(run: WorkflowRun): string {
  const running = run.steps.findIndex((step) => step.status === "running");
  if (running !== -1) {
    const previous = run.steps[running - 1];
    const finished = previous?.status === "done" ? `第 ${running} 步 ${previous.label} 完成。` : "";
    return `${finished}正在运行：第 ${running + 1} 步 ${run.steps[running].label}。`;
  }

  const failed = run.steps.findIndex((step) => step.status === "failed");
  if (failed !== -1) {
    const step = run.steps[failed];
    return `第 ${failed + 1} 步 ${step.label} 中断：${step.error?.message ?? ""}`;
  }

  if (run.status === "done") return `全部 ${run.steps.length} 步完成。`;
  return "";
}

export function WorkflowProgress({
  run,
  onRetry,
}: {
  readonly run: WorkflowRun;
  readonly onRetry: (index: number) => void;
}) {
  // A one-step run that has finished shows no list at all. §10's 「document」
  // workflows are a single call, and a lone tick above the document is a heading,
  // a marker and a label all saying the same thing. While it runs — and if it
  // fails or is stopped — the row is the only progress there is, so it stays.
  if (run.steps.length === 1 && run.status === "done") return null;

  const last = run.steps.length - 1;

  return (
    <div>
      <ol>
        {run.steps.map((step, index) => (
          <WorkflowStepRow
            key={step.id}
            step={step}
            last={index === last}
            // Only the failed row gets one, and the engine's invariant guarantees
            // there is at most one: a run is always `[done…, failed?, pending…]`,
            // because it never advances past a failure.
            onRetry={step.status === "failed" ? () => onRetry(index) : undefined}
          />
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announcement(run)}
      </p>
    </div>
  );
}
