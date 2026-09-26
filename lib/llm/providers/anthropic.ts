/**
 * Anthropic adapter — docs/05_API_SPEC.md §4
 *
 * Uses the official SDK rather than hand-rolling the wire format: the SDK
 * carries the typed error classes (§7), the stream event handling, and the
 * browser flag.
 *
 * This is the one adapter where parameter drift is a live hazard, so the
 * capability gating below is deliberate rather than defensive. Anthropic's
 * current generation removed `temperature` / `top_p` / `top_k` (they now return
 * a 400) and replaced depth control with `output_config.effort`. A request that
 * carries the old parameters looks entirely reasonable and fails outright.
 *
 * Two guards, both from §3.4:
 *   1. Gate each parameter on a model-generation check, defaulting to *omit*
 *      when the generation is not recognised. Omitting a parameter costs a
 *      little control; sending an unknown one costs the whole request.
 *   2. On a 400 that names an unsupported parameter, drop it and retry once.
 *      That is what keeps this working when a model ships that this table has
 *      never heard of.
 */

import type {
  Credentials,
  Effort,
  GenerateRequest,
  GenerateResult,
  ModelProvider,
  StreamChunk,
  ValidateResult,
} from "@/lib/llm/types";
import {
  abortError,
  appError,
  errorFromStatus,
  isAppError,
  refusalError,
  unsupportedParameter,
} from "@/lib/llm/errors";

const LABEL = "Anthropic";
const DEFAULT_MAX_TOKENS = 8192;

type AnthropicModule = typeof import("@anthropic-ai/sdk");
type AnthropicClient = InstanceType<AnthropicModule["default"]>;

/**
 * Loaded lazily so the SDK stays out of the landing page bundle. The landing
 * page is competing for attention on a social feed; it has no reason to carry a
 * provider SDK it will never call.
 */
async function loadSdk(): Promise<AnthropicModule> {
  return import("@anthropic-ai/sdk");
}

function makeClient(mod: AnthropicModule, creds: Credentials): AnthropicClient {
  return new mod.default({
    apiKey: creds.apiKey,
    ...(creds.baseUrl ? { baseURL: creds.baseUrl } : {}),
    // Required in a browser context. The SDK sets the
    // `anthropic-dangerous-direct-browser-access` header when this is on; a
    // request missing it is indistinguishable in JavaScript from a network
    // outage (05_API_SPEC.md §4.2).
    dangerouslyAllowBrowser: true,
  });
}

type Generation = "current" | "legacy" | "unknown";

/**
 * Which parameter surface a model accepts.
 *
 * `unknown` is the safe default and the important case: a model this code has
 * never seen gets no sampling parameters at all. That is a slightly less tuned
 * answer, versus a hard failure.
 */
function generationOf(model: string): Generation {
  if (/^claude-(opus-5|sonnet-5|fable-5|mythos-5)/.test(model)) return "current";
  if (/^claude-opus-4-(7|8)/.test(model)) return "current";
  if (/^claude-3/.test(model)) return "legacy";
  if (/^claude-(opus|sonnet|haiku)-4/.test(model)) return "legacy";
  return "unknown";
}

interface Body {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  thinking?: { type: "adaptive" };
  output_config?: { effort: Effort };
  temperature?: number;
}

/**
 * Builds the request body, honouring `dropped`.
 *
 * `max_tokens` is not optional here: omitting it is a 400, not a default
 * (05_API_SPEC.md §3.3).
 */
function buildBody(req: GenerateRequest, dropped: ReadonlySet<string>): Body {
  const generation = generationOf(req.model);

  const body: Body = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: req.system,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (!dropped.has("thinking") && generation === "current") {
    // No `display`: reasoning is not surfaced in this product, and the default
    // (`omitted`) returns empty thinking text, which is what we want
    // (02_TECH_SPEC.md §6.4.1).
    body.thinking = { type: "adaptive" };
  }

  if (!dropped.has("output_config") && generation === "current" && req.effort) {
    body.output_config = { effort: req.effort };
  }

  if (!dropped.has("temperature") && generation === "legacy" && req.temperature !== undefined) {
    body.temperature = req.temperature;
  }

  return body;
}

/** Extracts whatever text the error carries, for parameter-drift detection. */
function errorText(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; error?: unknown };
    const parts = [typeof e.message === "string" ? e.message : ""];
    if (e.error) {
      try {
        parts.push(JSON.stringify(e.error));
      } catch {
        /* not serialisable; the message alone will have to do */
      }
    }
    return parts.join(" ");
  }
  return String(err);
}

function mapError(err: unknown, mod: AnthropicModule): never {
  if (err instanceof mod.default.APIUserAbortError) throw abortError();
  if (isAppError(err)) throw err;

  if (err instanceof mod.default.APIError) {
    const status = err.status ?? 500;
    throw errorFromStatus(status, errorText(err), LABEL);
  }

  throw appError("PROVIDER_ERROR", `${LABEL}: ${errorText(err)}`);
}

/**
 * True when a drift retry is worth attempting: a 400 naming a parameter, before
 * any output has been produced.
 */
function driftRetry(err: unknown, mod: AnthropicModule, emitted: boolean): string | null {
  if (emitted) return null;
  if (!(err instanceof mod.default.APIError)) return null;
  if (err.status !== 400) return null;
  return unsupportedParameter(errorText(err));
}

const anthropic: ModelProvider = {
  id: "anthropic",

  async generate(req: GenerateRequest, creds: Credentials): Promise<GenerateResult> {
    const mod = await loadSdk();
    const client = makeClient(mod, creds);
    const dropped = new Set<string>();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const message = await client.messages.create(buildBody(req, dropped), {
          signal: req.signal,
        });

        if (message.stop_reason === "refusal") {
          throw refusalError(message.stop_details?.category ?? null, LABEL);
        }

        const text = message.content
          .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
          .map((block) => block.text)
          .join("");

        return {
          text,
          stopReason: message.stop_reason ?? undefined,
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          },
        };
      } catch (err) {
        const param = driftRetry(err, mod, false);
        if (param && !dropped.has(param)) {
          // Logged locally, without credentials, so the capability table above
          // can be corrected rather than silently degrading (§3.4 rule 3).
          console.warn(
            `[${LABEL}] model "${req.model}" rejected parameter "${param}"; retrying without it. ` +
              "Update generationOf() in lib/llm/providers/anthropic.ts.",
          );
          dropped.add(param);
          continue;
        }
        mapError(err, mod);
      }
    }

    throw appError("PROVIDER_ERROR", `${LABEL}: exhausted parameter-drift retry`);
  },

  async *stream(req: GenerateRequest, creds: Credentials): AsyncGenerator<StreamChunk> {
    const mod = await loadSdk();
    const client = makeClient(mod, creds);
    const dropped = new Set<string>();

    for (let attempt = 0; attempt < 2; attempt++) {
      let emitted = false;

      try {
        const stream = client.messages.stream(buildBody(req, dropped), { signal: req.signal });

        for await (const event of stream) {
          switch (event.type) {
            case "content_block_delta":
              if (event.delta.type === "text_delta") {
                emitted = true;
                yield { type: "text", value: event.delta.text };
              }
              // thinking_delta and input_json_delta are ignored: this product
              // surfaces neither reasoning nor tool input.
              break;
            default:
              // message_start / content_block_start / content_block_stop /
              // message_delta / message_stop / ping. Usage and stop reason come
              // from finalMessage() below, which handles abort and error states
              // itself — do not wrap the event loop in a promise to get them.
              break;
          }
        }

        const final = await stream.finalMessage();

        if (final.stop_reason === "refusal") {
          yield { type: "error", error: refusalError(final.stop_details?.category ?? null, LABEL) };
          return;
        }

        yield {
          type: "usage",
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
        };
        yield { type: "done" };
        return;
      } catch (err) {
        const param = driftRetry(err, mod, emitted);
        if (param && !dropped.has(param)) {
          console.warn(
            `[${LABEL}] model "${req.model}" rejected parameter "${param}"; retrying without it. ` +
              "Update generationOf() in lib/llm/providers/anthropic.ts.",
          );
          dropped.add(param);
          continue;
        }
        mapError(err, mod);
      }
    }
  },

  async validate(creds: Credentials): Promise<ValidateResult> {
    const mod = await loadSdk();
    try {
      const client = makeClient(mod, creds);
      const models: string[] = [];
      // A list call, never a generation: verification must not cost the user
      // anything (05_API_SPEC.md §5).
      for await (const model of client.models.list({ limit: 100 })) {
        models.push(model.id);
      }
      return { ok: true, models };
    } catch (err) {
      try {
        mapError(err, mod);
      } catch (mapped) {
        if (isAppError(mapped)) return { ok: false, error: mapped };
        throw mapped;
      }
      return { ok: false, error: appError("PROVIDER_ERROR", `${LABEL}: validation failed`) };
    }
  },
};

export default anthropic;
