/**
 * Model Gateway types — docs/02_TECH_SPEC.md §6
 *
 * All provider communication goes through this boundary. Components must never
 * call a provider SDK or fetch an LLM endpoint directly — that is what keeps C3
 * (migratability) true, and it is the seam a future migration replaces.
 */

import type { AppError } from "@/lib/llm/errors";

export type ProviderId = "openai" | "anthropic" | "google" | "compatible";

/**
 * Only two roles exist at this boundary. `system` is deliberately absent: the
 * three providers disagree about where a system prompt goes (05_API_SPEC.md
 * §3.1), so it is a field on the request, not a message. Keeping it out of
 * `messages` means the adapters cannot get the placement wrong by omission.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Depth control for Anthropic's current generation, which removed
 * `temperature` (05_API_SPEC.md §3.4).
 *
 * This is the one field beyond the shape in 02_TECH_SPEC.md §6. It is here
 * because §6.4's `PROFILE_INTENT` defines an `anthropicEffort` per profile and
 * something has to carry it from the profile to the adapter. The alternative —
 * each adapter importing the profile table — would put profile knowledge in
 * four places instead of one.
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface GenerateRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  /**
   * Sampling temperature for the providers that still accept one. The adapter
   * decides whether it goes on the wire — see 02_TECH_SPEC.md §6.4. Anthropic's
   * current models reject this with a 400, so the Anthropic adapter drops it.
   */
  temperature?: number;
  maxTokens?: number;
  /** Anthropic only. Ignored by the other adapters. */
  effort?: Effort;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult {
  text: string;
  usage?: TokenUsage;
  /**
   * Provider-native stop reason, passed through for diagnostics. The one value
   * with behavioural meaning is Anthropic's `'refusal'` (05_API_SPEC.md §4.5),
   * which is surfaced as a distinct message rather than an empty answer.
   */
  stopReason?: string;
}

export type StreamChunk =
  | { type: "text"; value: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done" }
  | { type: "error"; error: AppError };

/**
 * What a provider call needs. Assembled by the caller from browser storage —
 * see 02_TECH_SPEC.md §7. Never logged, never persisted outside the browser.
 */
export interface Credentials {
  apiKey: string;
  /** Overrides the provider default. Required for `compatible`. */
  baseUrl?: string;
  /** The user's own forwarding proxy (05_API_SPEC.md §6). `compatible` only. */
  proxyUrl?: string;
}

export type ValidateResult =
  | { ok: true; models: string[] }
  | { ok: false; error: AppError };

export interface ModelProvider {
  readonly id: ProviderId;
  generate(req: GenerateRequest, creds: Credentials): Promise<GenerateResult>;
  stream(req: GenerateRequest, creds: Credentials): AsyncIterable<StreamChunk>;
  /** Powers the Verify button in Settings (05_API_SPEC.md §5). */
  validate(creds: Credentials): Promise<ValidateResult>;
}
