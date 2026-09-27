"use client";

import { WORKFLOW_DEFINITIONS } from "@/lib/workflow/registry";
import type { WorkflowId } from "@/lib/workflow/types";

/**
 * The ⚡ controls in the chat input's control row — docs/03_UI_UX_SPEC.md §6,
 * docs/01_PRD.md §8.1 (F1)
 *
 * **One button per workflow, never a menu.** An agent declares at most one today,
 * and the count is expected to grow, so the arrangement has to cost the same at
 * three as at one — the same argument `components/tools/ToolPanel.tsx` makes for
 * its chip row. A menu would additionally need an answer to "which one is
 * selected by default", and a component for a count that does not exist yet.
 *
 * **The label is the workflow's own Chinese name, not the word 「工作流」.** §6's
 * sketch draws `[⚡ 工作流]`, but a button reading 「工作流」 tells the user nothing
 * about what pressing it will do, and F1's requirement is that the workflow be
 * *exposed*, not that it be named after its category. `⚡ 30 天内容计划` does.
 * The name comes from `WORKFLOW_DEFINITIONS` rather than from the id for the same
 * reason `ToolPanel` looks up tool labels — joining raw ids prints
 * `creator-30day`, which is the defect this round fixed in `AgentRails`.
 *
 * **Disabled, never hidden.** The gate is the caller's (`ChatInput`), because the
 * predicate that decides whether there is anything to send is already there and
 * two copies of it would drift — the same reason §6 gives for the Send button.
 * A hidden ⚡ control would leave the user unable to tell whether the expert has
 * no workflow or the product is refusing right now.
 *
 * The reason is a `title` rather than a line of visible text: the row already
 * carries a hint line (the privacy claim, or the no-key prompt), and a second
 * sentence beside it would push the row onto two lines on a phone. A disabled
 * button still shows its `title` in every engine that matters, and the condition
 * that disabled it also greyed Send — so hovering either one explains both.
 */

export function WorkflowControls({
  workflows,
  onRun,
  blockedReason,
}: {
  readonly workflows: readonly WorkflowId[];
  readonly onRun: (id: WorkflowId) => void;
  /** Why they cannot be used right now, or `null` when they can. */
  readonly blockedReason: string | null;
}) {
  // Same rule as `AgentRails` and `ToolPanel`: an empty section is omitted
  // rather than shown empty. Six of the ten agents declare no workflow, and
  // giving them a greyed-out 「暂不支持」 would make each of them read as
  // unfinished rather than as having a different job.
  if (workflows.length === 0) return null;

  const blocked = blockedReason !== null;

  return (
    <>
      {workflows.map((id) => (
        <button
          key={id}
          type="button"
          disabled={blocked}
          title={blocked ? (blockedReason ?? undefined) : WORKFLOW_DEFINITIONS[id].description}
          onClick={() => onRun(id)}
          // Deliberately the same weight as the 附件 control beside it — plain
          // text, no border, no accent. §2 gives the accent to the one primary
          // action on a screen, and in this row that is 发送.
          className="flex shrink-0 items-center gap-1 text-micro text-ink-muted transition-colors duration-150 ease-out hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true">⚡</span>
          {WORKFLOW_DEFINITIONS[id].label}
        </button>
      ))}
    </>
  );
}
