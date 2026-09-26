/**
 * Agent configuration types — docs/02_TECH_SPEC.md §5
 *
 * An agent is not a prompt. It is identity + policy + knowledge + tools +
 * workflow + memory + safety, with the configuration as the only place those
 * parts are assembled. That is what makes the platform a platform rather than a
 * chatbot with ten names (docs/04_AGENT_SPEC.md §1).
 */

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
  /** Tool ids. Empty in the MVP — docs/04_AGENT_SPEC.md §1. */
  tools: string[];
  /** Workflow ids from `lib/workflow/definitions/`. Empty when none. */
  workflows: string[];
  modelProfile: ModelProfileId;
  safetyPolicy: SafetyPolicyId;
  /** Empty-state chips in the workspace. Empty for disabled agents. */
  suggestedPrompts: string[];
}
