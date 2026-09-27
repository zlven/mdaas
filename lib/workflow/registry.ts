/**
 * The workflow registry — docs/02_TECH_SPEC.md §10
 *
 * Pure data and pure functions, deliberately: `components/agent/AgentRails.tsx`
 * is a server component with no `"use client"`, and it reads this map to print
 * an agent's workflow *names* in the right rail. Nothing here may reach for a
 * browser API, React, or a provider.
 *
 * This is the second half of the two-directional typing that `lib/tools/types.ts`
 * documents:
 *
 *   - `AgentConfig.workflows` is `readonly WorkflowId[]`, so naming a workflow
 *     that does not exist is a **compile error**.
 *   - this map is `Record<WorkflowId, WorkflowDefinition>`, so adding an id to
 *     `WORKFLOW_IDS` without defining it is also a **compile error**.
 *
 * Between the two there is no way to declare a workflow that does not exist,
 * which is why nothing validates workflow ids at runtime — a `validate()` rule in
 * `lib/agents/registry.ts` would be unreachable code guarding a case the compiler
 * already rejects. That is the fix for the defect this round started from:
 * `configs/office.ts` and `configs/fitness.ts` declared two workflows that did not
 * exist, and nothing type-checked, built, or validated the claim.
 */

import { creator30day } from "@/lib/workflow/definitions/creator-30day";
import { fitnessPlan } from "@/lib/workflow/definitions/fitness-plan";
import { officeMeetingSummary } from "@/lib/workflow/definitions/office-meeting-summary";
import type { WorkflowDefinition, WorkflowId } from "@/lib/workflow/types";

export const WORKFLOW_DEFINITIONS: Record<WorkflowId, WorkflowDefinition> = {
  "creator-30day": creator30day,
  "office-meeting-summary": officeMeetingSummary,
  "fitness-plan": fitnessPlan,
};

/** Total by construction, so `undefined` is not a case a caller has to handle. */
export function getWorkflow(id: WorkflowId): WorkflowDefinition {
  return WORKFLOW_DEFINITIONS[id];
}
