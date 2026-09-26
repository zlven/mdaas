/**
 * Agent configuration types — docs/02_TECH_SPEC.md §5
 *
 * An agent is not a prompt. It is identity + policy + knowledge + tools +
 * workflow + memory + safety, with the configuration as the only place those
 * parts are assembled. That is what makes the platform a platform rather than a
 * chatbot with ten names (docs/04_AGENT_SPEC.md §1).
 */

import type { ToolId } from "@/lib/tools/types";

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
   */
  enabled: boolean;
  /**
   * Resolved from `lib/generated/prompts.ts`, which the asset build produces
   * from `prompts/<id>.md`. Disabled agents carry `NOT_IMPLEMENTED_PROMPT`,
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
  /** Workflow ids from `lib/workflow/definitions/`. Empty when none. */
  workflows: string[];
  modelProfile: ModelProfileId;
  safetyPolicy: SafetyPolicyId;
  /** Empty-state chips in the workspace. Empty for disabled agents. */
  suggestedPrompts: string[];
}
