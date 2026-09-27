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

/**
 * One metric an agent suggests the user track over time — docs/04_AGENT_SPEC.md §9.
 *
 * A **suggestion**, not a whitelist: it is a one-tap starting point in the panel's
 * empty state, and the user can create any series they like without one. The
 * distinction matters because a suggestion carries a claim — that this number is
 * worth watching — and the claim has to be sourced. Every list in
 * `lib/agents/configs/` was checked against that agent's own knowledge base.
 *
 * `label` and `unit` are **copied into the series record when it is created**, so
 * removing a suggestion later cannot orphan a series a user already keeps
 * (`lib/series/types.ts`). `basis` is deliberately not: it is our prose about what
 * the number means, read live and rendered both under the chart and as the
 * series' second injected entry, so a wording fix in one place fixes it
 * everywhere.
 *
 * **Declared inline, not in a totals registry.** The test is whether a
 * `Record<Id, …>` buys anything: those buy compile-time safety by being referenced
 * from *two* directions, which is how `ToolId` reaches `TOOL_COMPONENTS` and how
 * `WorkflowId` reaches `WORKFLOW_DEFINITIONS`. Nothing references a metric id from
 * a second place — a metric has no component and no definition body. What it has
 * is `{ key, label, unit, basis, hint? }`, which is the exact shape of
 * `ProfileField`, and that is declared inline. A union would also put a shared
 * file in the path of adding an agent, which C4 asks not to happen.
 */
export interface MetricSuggestion {
  /** Stable key, unique within an agent. What `Series.metricKey` records. */
  key: string;
  /** Chinese label, e.g. 体重. Becomes the series' default name. */
  label: string;
  /** e.g. `kg`. May be `""` — several of these have no unit. */
  unit: string;
  /**
   * The 口径: what this number counts and how it should be measured. Injected as
   * the series' second entry and printed under the chart.
   *
   * **Required, and never empty.** It is the product's only chance to say what a
   * number means without interpreting it, and a suggestion that cannot say what
   * it is measuring should not be suggested. Asserted in `verify-series.mts`.
   */
  basis: string;
  /** Optional clarification shown in the panel. */
  hint?: string;
}

export interface AgentConfig {
  /** Stable slug. Must match the `knowledge/<id>/` directory name. */
  id: string;
  /** English display name, for the document title and the metadata tags. */
  name: string;
  nameZh: string;
  /** Emoji. The product carries no illustrations (03_UI_UX_SPEC.md §3). */
  icon: string;
  /**
   * The agent's colour, as `#rrggbb` — docs/03_UI_UX_SPEC.md §2.
   *
   * Used in exactly two places on the agent's own pages: the icon plate, at 14%
   * behind the emoji, and the page's accent via `agentAccent()` (the primary
   * action, the active state, the focus ring). It is deliberately *not* a card
   * colour — the grid shows ten agents at once and stays monochrome.
   *
   * **It used to be hashed from the id**, on the argument that hashing meant
   * nothing had to be configured per agent. The argument did not hold: this
   * field is in `lib/agents/configs/` too, so declaring it touches exactly as
   * much, and only declaring it can know that `finance` should not come out
   * purple. The colours were then solved rather than chosen — see the block in
   * `app/globals.css` — and two properties are machine-checked by
   * `verify:theme.mts`: every tint clears 4.5:1 behind white text, and no two are
   * within a perceptual distance of 15, because ten hues sharing 360° are packed
   * tightly enough that "looks like its domain" and "is tellable from its
   * neighbour" genuinely pull against each other.
   */
  tint: string;
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
   * Metrics this agent suggests tracking over time — docs/04_AGENT_SPEC.md §9.
   *
   * Absent means the agent suggests none, which is a valid state rather than an
   * unfinished one: `parenting`'s knowledge base is deliberately anti-numeric, so
   * it offers nothing to chart while still giving the parent the panel and the
   * ability to name a series themselves. Nothing anywhere special-cases that —
   * `undefined` is already the "asks for nothing" state.
   */
  metrics?: readonly MetricSuggestion[];
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
