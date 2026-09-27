/**
 * Model profiles — docs/02_TECH_SPEC.md §6.4
 *
 * A profile expresses **intent**, and decouples agent config from concrete model
 * names so a provider swap does not require editing nine agent configs.
 *
 * The values here are *not* a wire format. The adapter decides what actually
 * goes on the wire, because the parameters that control sampling differ per
 * provider and per model generation — and getting that wrong is a 400 from the
 * provider, not a subtly worse answer. See 05_API_SPEC.md §3.4 for the live
 * example that already caught this project out once.
 */

import type { Effort } from "@/lib/llm/types";

export type ProfileIntent = "reasoning" | "creative" | "balanced";

export interface ResolvedProfile {
  maxTokens: number;
  /** Anthropic current models only. The adapter drops it for other providers. */
  effort: Effort;
  /**
   * OpenAI / Google / compatible only. Anthropic's current generation removed
   * `temperature` and returns a 400 if it is sent.
   */
  temperature: number;
}

export const PROFILE_INTENT: Record<ProfileIntent, ResolvedProfile> = {
  // office, career, study, finance — precision matters more than range.
  reasoning: { maxTokens: 16000, effort: "high", temperature: 0.3 },
  // creator, style — variety is the point.
  creative: { maxTokens: 16000, effort: "medium", temperature: 0.8 },
  // fitness, mental, parenting — conversational, and latency is felt.
  balanced: { maxTokens: 8000, effort: "medium", temperature: 0.6 },
};

export function resolveProfile(intent: ProfileIntent): ResolvedProfile {
  return PROFILE_INTENT[intent];
}
