"use client";

import { Notice } from "@/components/ui/Notice";
import { WorkflowProgress } from "@/components/workflow/WorkflowProgress";
import { WorkflowResult } from "@/components/workflow/WorkflowResult";
import type { AppError } from "@/lib/llm/errors";
import { getWorkflow } from "@/lib/workflow/registry";
import type { WorkflowRun } from "@/lib/workflow/types";

/**
 * A run, inline at the tail of the conversation — docs/03_UI_UX_SPEC.md §7
 *
 * §7's first line: "Inline in the conversation where the workflow was invoked, not
 * a modal." That is why this is a section in the message column and not an
 * overlay, and it is also why it takes the run as a prop rather than subscribing
 * to the store itself: `Workspace` already subscribes, and two subscriptions to
 * the same snapshot is two places that can decide to render at different times.
 *
 * **Named `WorkflowRunView`, not `WorkflowRun`.** Both this component and the type
 * `WorkflowRun` are imported by `Workspace.tsx`, and a component and a type
 * sharing a name is a shadowing bug waiting to be written — the import that wins
 * depends on which one a given file happened to bring in.
 *
 * **The user's ask is shown inside the run.** The ⚡ path does not push a user
 * turn into the conversation — a run is not a chat turn — so without this line a
 * run restored after a reload (F6) would be a plan with nothing saying what it
 * was for. It is a muted line rather than a right-aligned bubble because it is
 * part of the run's header, not a separate message in the thread.
 *
 * **No card around the whole thing.** §7's sketch draws the run directly on the
 * background, and a bordered box here would sit around both the step list and the
 * finished document — the box-in-a-box `Disclosure`'s `plain` tone exists to
 * avoid.
 */

/** The run's own state, in one word, beside its name. */
const STATUS: Partial<Record<WorkflowRun["status"], string>> = {
  running: "运行中",
  failed: "已中断",
  aborted: "已停止",
};

export function WorkflowRunView({
  run,
  saveFailed,
  notice,
  onRetry,
}: {
  readonly run: WorkflowRun;
  /**
   * The run is live but not reaching storage. Worth saying once, at the top: it
   * does not affect the run, and it is the user's only warning that a reload will
   * cost them the whole thing.
   */
  readonly saveFailed: boolean;
  /** A knowledge base that would not load. Reported once, for the whole run. */
  readonly notice: AppError | null;
  readonly onRetry: (index: number) => void;
}) {
  const definition = getWorkflow(run.workflowId);
  const status = STATUS[run.status];

  return (
    <section aria-label={definition.label} className="space-y-3">
      <div className="space-y-1">
        <h2 className="flex flex-wrap items-baseline gap-x-2 text-h3 text-ink">
          <span aria-hidden="true">⚡</span>
          {definition.label}
          {status ? <span className="text-micro font-normal text-ink-subtle">{status}</span> : null}
        </h2>
        {run.input === "" ? null : (
          <p className="whitespace-pre-wrap text-small text-ink-muted">{run.input}</p>
        )}
      </div>

      {notice ? <Notice error={notice} /> : null}

      {saveFailed ? (
        <p className="text-micro text-ink-subtle">这次运行的进度没能存到浏览器里，刷新页面就会丢失。</p>
      ) : null}

      <WorkflowProgress run={run} onRetry={onRetry} />
      <WorkflowResult definition={definition} run={run} />
    </section>
  );
}
