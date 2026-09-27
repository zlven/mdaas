/**
 * Agent configuration types — docs/02_TECH_SPEC.md §5
 *
 * An agent is not a prompt. It is identity + policy + knowledge + tools +
 * workflow + memory + safety, with the configuration as the only place those
 * parts are assembled. That is what makes the platform a platform rather than a
 * chatbot with ten names (docs/04_AGENT_SPEC.md §1).
 */

import type { ToolId } from "@/lib/tools/types";
import type { WorkflowId } from "@/lib/workflow/types";

/**
 * Intent, not wire parameters — docs/02_TECH_SPEC.md §6.4.
 *
 * The adapter decides what actually goes on the wire, because the sampling
 * parameters differ per provider and per model generation. Nothing outside
 * `lib/llm/` should know what a profile turns into.
 */
export type ModelProfileId = "reasoning" | "creative" | "balanced";

/**
 * Safety policies — docs/02_TECH_SPEC.md §13.
 *
 * `content-default` is the baseline for domains with no special duty of care.
 * The other four carry real obligations and are named here so Phase 2 does not
 * have to rediscover them.
 */
export type SafetyPolicyId =
  | "content-default"
  | "health-edu"
  | "crisis-escalation"
  | "financial-edu"
  | "minor-safety";

/**
 * Coarse grouping for the agent grid.
 *
 * Not currently used to partition the landing page (docs/03_UI_UX_SPEC.md §3
 * specifies one flat grid of ten), but it is carried on the config so a future
 * filter does not require touching every config file.
 */
export type AgentCategory = "work" | "growth" | "health" | "life";

/**
 * One field of an agent's profile — docs/04_AGENT_SPEC.md §6.
 *
 * The agent declares what it needs to know and the user fills it in. Because the
 * key and the type come from here rather than from free-form user input, the
 * agent knows what it is reading and the UI can render a form instead of a blank
 * textarea. Values are stored as strings keyed by `key`; `type` governs the
 * input control, not the storage.
 */
interface ProfileFieldBase {
  /** Stable key — the storage key, and what a future migration would key on. */
  key: string;
  /** Chinese label, shown in the form and in the block injected into the prompt. */
  label: string;
  /** Optional clarification shown under the input. */
  hint?: string;
}

export type ProfileField =
  | (ProfileFieldBase & { type: "text" })
  | (ProfileFieldBase & { type: "number"; unit?: string })
  | (ProfileFieldBase & { type: "select"; options: readonly string[] });

export interface AgentConfig {
  /** Stable slug. Must match the `knowledge/<id>/` directory name. */
  id: string;
  /** English display name, for the document title and the metadata tags. */
  name: string;
  nameZh: string;
  /** Emoji. The product carries no illustrations (03_UI_UX_SPEC.md §3). */
  icon: string;
  category: AgentCategory;
  /** One sentence, Chinese. Shown on the card. */
  description: string;
  /** Short tags for the card. Keep to five or fewer. */
  capabilities: string[];
  /**
   * false renders the card as "Coming Soon" and blocks the workspace from
   * rendering an input (01_PRD.md §3.3).
   *
   * The staging mechanism, not a live state: all ten agents are `enabled: true`
   * and the `Coming Soon` render paths are currently unreachable
   * (00_PRODUCT_BRIEF.md §4).
   */
  enabled: boolean;
  /**
   * Resolved from `lib/generated/prompts.ts`, which the asset build produces
   * from `prompts/<id>.md`. A disabled agent carries `NOT_IMPLEMENTED_PROMPT`,
   * which is unreachable rather than merely unused.
   */
  systemPrompt: string;
  /** `knowledge/<id>/`, or null when the agent has no knowledge base. */
  knowledgeBase: string | null;
  /**
   * Fields this agent asks the user to fill in — docs/04_AGENT_SPEC.md §6.
   *
   * Absent means the agent has no profile, which is a valid state rather than an
   * unfinished one. Declaring the fields here is the entire cost of adding one
   * (06_ACCEPTANCE.md C4).
   */
  profile?: readonly ProfileField[];
  /**
   * Tool ids — docs/04_AGENT_SPEC.md §7. Empty when the agent carries none.
   *
   * Typed rather than `string[]` so a bad id is a compile error; see
   * `lib/tools/types.ts`.
   */
  tools: readonly ToolId[];
  /**
   * Workflow ids from `lib/workflow/definitions/`. Empty when none.
   *
   * Typed rather than `string[]`, the same way `tools` is and for the same
   * reason: a config declaring a workflow that does not exist has to be a
   * compile error rather than a rail that prints a slug. That defect was real —
   * `office` and `fitness` both declared workflows that had never been written,
   * nothing type-checked or validated the claim, and the right rail rendered
   * 「工作流：office-meeting-summary」 to the user.
   *
   * The closed union means adding a workflow needs a rebuild. For a statically
   * exported build with no runtime plugin surface that is the correct trade, but
   * it is a decision rather than an accident — see `lib/workflow/registry.ts`.
   */
  workflows: readonly WorkflowId[];
  modelProfile: ModelProfileId;
  /**
   * A label recording which safety obligation this agent carries. **Read by
   * nothing at runtime** — there is no policy engine (02_TECH_SPEC.md §13).
   * The boundary itself is written as the last numbered rule of §六 in
   * `prompts/<id>.md`; this field only keeps a future engine from having to
   * rediscover which agents have one.
   */
  safetyPolicy: SafetyPolicyId;
  /** Empty-state chips in the workspace. Empty for disabled agents. */
  suggestedPrompts: string[];
}
