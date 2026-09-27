"use client";

import { Markdown } from "@/components/chat/Markdown";
import { renderResult } from "@/lib/workflow/run";
import type { WorkflowDefinition, WorkflowRun } from "@/lib/workflow/types";

/**
 * The finished run as one artefact — docs/06_ACCEPTANCE.md F8, docs/01_PRD.md §8.2
 *
 * §7: "When the workflow completes, the seven sections render as one structured
 * result beneath — this is the artefact the user came for and the thing they will
 * screenshot." So there is no container here: no border, no card, no heading
 * around it. The run's own header is directly above and a bubble around long-form
 * markdown looks wrong (§5). This component is one line of markup on purpose, and
 * that is the decision.
 *
 * **Only a finished run renders.** A failed or stopped run has its partial text
 * one step up, individually expandable, and assembling it into a document would
 * present a truncated artefact as *the* result — under an error, which is the one
 * place the user is already being told something went wrong. `renderResult`
 * handles both shapes; this is the gate in front of it.
 */
export function WorkflowResult({
  definition,
  run,
}: {
  readonly definition: WorkflowDefinition;
  readonly run: WorkflowRun;
}) {
  if (run.status !== "done") return null;
  return <Markdown source={renderResult(definition, run)} />;
}
