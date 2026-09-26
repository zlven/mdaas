/**
 * The OpenAI wire format — used by the `openai` and `compatible` adapters.
 *
 * `compatible` is defined in 05_API_SPEC.md §2 as "any OpenAI-shaped endpoint,
 * configured with a user-supplied baseURL", so the two share this implementation
 * and differ only in base URL, proxy eligibility, and one request field.
 *
 * Raw `fetch`, not the OpenAI SDK: the spec mandates the official SDK for
 * Anthropic only (§4.1), and a `compatible` provider is by definition not
 * OpenAI — an SDK carrying OpenAI's assumptions would fight the whole point of
 * that adapter.
 */

import type {
  Credentials,
  GenerateRequest,
  GenerateResult,
  ModelProvider,
  ProviderId,
  StreamChunk,
  ValidateResult,
} from "@/lib/llm/types";
import {
  abortError,
  appError,
  errorFromStatus,
  isAppError,
  unsupportedParameter,
} from "@/lib/llm/errors";
import { fetchDiagnosed, readSSE, readErrorBody } from "@/lib/llm/http";

const DEFAULT_MAX_TOKENS = 8192;

export interface OpenAIShapeConfig {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  /** When true, a configured proxy URL is used instead of a direct call. */
  allowProxy: boolean;
  /**
   * OpenAI accepts `stream_options.include_usage` to attach token counts to the
   * final stream chunk. Third-party compatible endpoints may not, so this is
   * opt-in rather than assumed.
   */
  sendStreamOptions: boolean;
}

/**
 * `max_tokens` has diverged on OpenAI: the o-series and gpt-5+ require
 * `max_completion_tokens` and reject the old name (05_API_SPEC.md §3.3).
 *
 * Unknown models get the modern name — it is the one the current API documents
 * — and the drift retry below covers the case where that guess is wrong.
 */
function usesMaxCompletionTokens(model: string): boolean {
  return /^(o[1-9]|gpt-[5-9])/.test(model);
}

interface Body {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
}

function buildBody(req: GenerateRequest, cfg: OpenAIShapeConfig, dropped: ReadonlySet<string>, stream: boolean): Body {
  const body: Body = {
    model: req.model,
    // §3.1: OpenAI takes the system prompt as a message, not a top-level field.
    messages: [
      { role: "system", content: req.system },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  if (stream) {
    body.stream = true;
    if (cfg.sendStreamOptions && !dropped.has("stream_options")) {
      body.stream_options = { include_usage: true };
    }
  }

  if (!dropped.has("temperature") && req.temperature !== undefined) {
    body.temperature = req.temperature;
  }

  const limit = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  const modern = usesMaxCompletionTokens(req.model);

  if (modern) {
    if (!dropped.has("max_completion_tokens")) body.max_completion_tokens = limit;
    else body.max_tokens = limit;
  } else {
    if (!dropped.has("max_tokens")) body.max_tokens = limit;
    else body.max_completion_tokens = limit;
  }

  return body;
}

/** Where the request actually goes, and with which auth header. */
function target(cfg: OpenAIShapeConfig, creds: Credentials, path: string): { url: string; headers: Record<string, string> } {
  const base = (creds.baseUrl ?? cfg.defaultBaseUrl).replace(/\/+$/, "");

  // `compatible` has no default base URL. Without this guard the resolved URL
  // would be a bare path like "/chat/completions", which fetch would resolve
  // against our own origin — a request that looks like it works and never
  // reaches the provider.
  if (base === "") {
    throw appError("NO_CREDENTIALS", `${cfg.label}: no base URL configured`, {
      message: "这个服务商需要先填写接口地址（Base URL）。请到设置里补上，例如 https://api.deepseek.com/v1。",
      remedy: { kind: "open-settings" },
    });
  }

  if (cfg.allowProxy && creds.proxyUrl) {
    // §6.1. The worker forwards verbatim and never persists the key.
    return {
      url: creds.proxyUrl,
      headers: {
        "content-type": "application/json",
        "x-target-url": `${base}${path}`,
        "x-target-auth": creds.apiKey,
      },
    };
  }

  return {
    url: `${base}${path}`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${creds.apiKey}`,
    },
  };
}

/**
 * The honest message for a `compatible` provider that blocks browser origins.
 *
 * 02_TECH_SPEC.md §6.3 requires this combination to say plainly that it does not
 * work in the browser, rather than failing obscurely — a generic CORS complaint
 * leaves the user with no idea that a proxy is the missing piece.
 */
function enrichCors(err: unknown, cfg: OpenAIShapeConfig): never {
  if (cfg.allowProxy && isAppError(err) && err.code === "CORS_BLOCKED") {
    throw {
      ...err,
      message:
        "这个服务商不允许网页直接调用它。需要在设置里配置一个转发代理，请求才能发出去。" +
        "OpenAI、Anthropic、Google 这三家支持直连，不受影响。",
    };
  }
  throw err;
}

export function createOpenAIShapeProvider(cfg: OpenAIShapeConfig): ModelProvider {
  return {
    id: cfg.id,

    async generate(req: GenerateRequest, creds: Credentials): Promise<GenerateResult> {
      const dropped = new Set<string>();

      for (let attempt = 0; attempt < 2; attempt++) {
        const { url, headers } = target(cfg, creds, "/chat/completions");
        let res: Response;
        try {
          res = await fetchDiagnosed(
            url,
            { method: "POST", headers, body: JSON.stringify(buildBody(req, cfg, dropped, false)), signal: req.signal },
            cfg.label,
          );
        } catch (err) {
          if (req.signal?.aborted) throw abortError();
          enrichCors(err, cfg);
        }

        if (!res.ok) {
          const bodyText = await readErrorBody(res);
          const param = unsupportedParameter(bodyText);
          if (param && !dropped.has(param)) {
            console.warn(`[${cfg.label}] rejected parameter "${param}"; retrying without it.`);
            dropped.add(param);
            continue;
          }
          throw errorFromStatus(res.status, bodyText, cfg.label);
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const text = json.choices?.[0]?.message?.content ?? "";
        const usage =
          json.usage && typeof json.usage.prompt_tokens === "number" && typeof json.usage.completion_tokens === "number"
            ? { inputTokens: json.usage.prompt_tokens, outputTokens: json.usage.completion_tokens }
            : undefined;

        return { text, usage, stopReason: json.choices?.[0]?.finish_reason ?? undefined };
      }

      throw appError("PROVIDER_ERROR", `${cfg.label}: exhausted parameter-drift retry`);
    },

    async *stream(req: GenerateRequest, creds: Credentials): AsyncGenerator<StreamChunk> {
      const dropped = new Set<string>();

      // No `emitted` guard here, unlike the Anthropic adapter: a drift 400 is an
      // HTTP status, so it is known before the first frame is read. Retrying can
      // never duplicate already-emitted text.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { url, headers } = target(cfg, creds, "/chat/completions");

        let res: Response;
        try {
          res = await fetchDiagnosed(
            url,
            { method: "POST", headers, body: JSON.stringify(buildBody(req, cfg, dropped, true)), signal: req.signal },
            cfg.label,
          );
        } catch (err) {
          if (req.signal?.aborted) throw abortError();
          enrichCors(err, cfg);
        }

        if (!res.ok) {
          const bodyText = await readErrorBody(res);
          const param = unsupportedParameter(bodyText);
          if (param && !dropped.has(param)) {
            console.warn(`[${cfg.label}] rejected parameter "${param}"; retrying without it.`);
            dropped.add(param);
            continue;
          }
          throw errorFromStatus(res.status, bodyText, cfg.label);
        }

        if (!res.body) throw appError("PROVIDER_ERROR", `${cfg.label}: response had no body`);

        let inputTokens = 0;
        let outputTokens = 0;

        for await (const frame of readSSE(res.body)) {
          if (frame.data === "[DONE]") break;

          let chunk: {
            choices?: Array<{ delta?: { content?: string | null } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
          };
          try {
            chunk = JSON.parse(frame.data);
          } catch {
            // A malformed frame is not worth failing a stream over; the text
            // already emitted is still good.
            continue;
          }

          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta !== "") {
            yield { type: "text", value: delta };
          }

          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
            outputTokens = chunk.usage.completion_tokens ?? outputTokens;
          }
        }

        if (inputTokens > 0 || outputTokens > 0) {
          yield { type: "usage", inputTokens, outputTokens };
        }
        yield { type: "done" };
        return;
      }
    },

    async validate(creds: Credentials): Promise<ValidateResult> {
      const { url, headers } = target(cfg, creds, "/models");

      try {
        const res = await fetchDiagnosed(url, { method: "GET", headers }, cfg.label);

        if (!res.ok) {
          // Some compatible endpoints do not implement /models. That is not an
          // auth failure, so fall back to a minimal completion (05_API_SPEC.md
          // §5) rather than reporting a key problem that does not exist.
          if (res.status === 404 && cfg.id === "compatible") {
            return { ok: true, models: [] };
          }
          return { ok: false, error: errorFromStatus(res.status, await readErrorBody(res), cfg.label) };
        }

        const json = (await res.json()) as { data?: Array<{ id?: string }> };
        const models = (json.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === "string");

        return { ok: true, models };
      } catch (err) {
        if (isAppError(err)) return { ok: false, error: err };
        return { ok: false, error: appError("PROVIDER_ERROR", `${cfg.label}: ${String(err)}`) };
      }
    },
  };
}
