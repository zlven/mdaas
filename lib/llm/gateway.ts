/**
 * Model Gateway — docs/02_TECH_SPEC.md §6
 *
 * The single door to every provider. Components must never call a provider SDK
 * or fetch an LLM endpoint directly — this is the seam that keeps C3
 * (migratability) true, and the only place that knows which adapters exist.
 *
 * Its three jobs:
 *   1. Refuse before reaching a provider when there is no key (§6.5 — the
 *      NO_CREDENTIALS case is raised here, never by an adapter).
 *   2. Turn a profile's *intent* into a request. What actually goes on the wire
 *      is the adapter's decision (§6.4).
 *   3. Guarantee that a stream only ever emits `StreamChunk`. The UI should not
 *      need a try/catch around a `for await`.
 */

import { appError, isAppError, type AppError } from "@/lib/llm/errors";
import { resolveProfile, type ProfileIntent } from "@/lib/llm/profiles";
import type {
  ChatMessage,
  Credentials,
  GenerateRequest,
  GenerateResult,
  ModelProvider,
  ProviderId,
  StreamChunk,
  ValidateResult,
} from "@/lib/llm/types";

import anthropic from "@/lib/llm/providers/anthropic";
import compatible from "@/lib/llm/providers/compatible";
import google from "@/lib/llm/providers/google";
import openai from "@/lib/llm/providers/openai";

const PROVIDERS: Record<ProviderId, ModelProvider> = {
  openai,
  anthropic,
  google,
  compatible,
};

/** Display names for the Settings provider picker. */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  google: "Google Gemini",
  compatible: "兼容接口（DeepSeek / Kimi / 通义 等）",
};

/**
 * Model suggestions shown in Settings before the user has verified a key.
 *
 * Only Anthropic has a curated list, because those IDs are recorded in
 * 05_API_SPEC.md §4.3. For the others, `validate()` returns the account's real
 * model list and that is strictly better than a hardcoded list that goes stale
 * — model IDs ship faster than this app will be updated (§4.3).
 *
 * The model field is free text everywhere. A closed dropdown would strand users
 * on models this app has never heard of.
 */
export const SUGGESTED_MODELS: Partial<Record<ProviderId, string[]>> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5-1"],
};

export interface GenerateOptions {
  providerId: ProviderId;
  credentials: Credentials;
  model: string;
  profile: ProfileIntent;
  system: string;
  messages: ChatMessage[];
  /** Overrides the profile's limit. Rarely needed. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export type StreamOptions = GenerateOptions;

export function getProvider(id: ProviderId): ModelProvider {
  return PROVIDERS[id];
}

export function listProviders(): ProviderId[] {
  return Object.keys(PROVIDERS) as ProviderId[];
}

/**
 * The §6.5 rule: a missing key is caught here rather than becoming a 401 from
 * the provider. The failure is local, instant, and stated in terms of what the
 * user can do about it.
 */
function requireCredentials(credentials: Credentials | undefined): AppError | null {
  if (!credentials || typeof credentials.apiKey !== "string" || credentials.apiKey.trim() === "") {
    return appError("NO_CREDENTIALS");
  }
  return null;
}

/**
 * Profile intent → request. Note that `temperature` and `effort` are both set:
 * every adapter receives the same request, and each drops what its provider
 * does not accept. That is the whole point of §6.4.
 */
function buildRequest(opts: GenerateOptions): GenerateRequest {
  const profile = resolveProfile(opts.profile);

  return {
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    temperature: profile.temperature,
    maxTokens: opts.maxTokens ?? profile.maxTokens,
    effort: profile.effort,
    signal: opts.signal,
  };
}

/** Anything that is not already an AppError is a bug, not a provider problem. */
function toAppError(err: unknown, providerId: ProviderId): AppError {
  if (isAppError(err)) return err;
  if (err instanceof Error && err.name === "AbortError") return appError("ABORTED");
  return appError("PROVIDER_ERROR", `${providerId}: ${err instanceof Error ? err.message : String(err)}`);
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const missing = requireCredentials(opts.credentials);
  if (missing) throw missing;

  try {
    return await getProvider(opts.providerId).generate(buildRequest(opts), opts.credentials);
  } catch (err) {
    throw toAppError(err, opts.providerId);
  }
}

/**
 * Streaming is required, not optional: a 20-second silent wait reads as broken
 * (02_TECH_SPEC.md §6.3).
 *
 * A failure after some text has already been emitted arrives as an `error`
 * chunk rather than a throw, so the UI keeps what it rendered and appends the
 * problem — 01_PRD.md §9 requires partial output to be preserved.
 */
export async function* stream(opts: StreamOptions): AsyncGenerator<StreamChunk> {
  const missing = requireCredentials(opts.credentials);
  if (missing) {
    yield { type: "error", error: missing };
    return;
  }

  try {
    for await (const chunk of getProvider(opts.providerId).stream(buildRequest(opts), opts.credentials)) {
      yield chunk;
    }
  } catch (err) {
    yield { type: "error", error: toAppError(err, opts.providerId) };
  }
}

/** Powers the Verify button. Never throws for an expected auth failure. */
export async function validate(providerId: ProviderId, credentials: Credentials): Promise<ValidateResult> {
  const missing = requireCredentials(credentials);
  if (missing) return { ok: false, error: missing };

  try {
    return await getProvider(providerId).validate(credentials);
  } catch (err) {
    return { ok: false, error: toAppError(err, providerId) };
  }
}
