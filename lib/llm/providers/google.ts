/**
 * Google Gemini adapter — docs/05_API_SPEC.md §2
 *
 * Gemini's wire format is the least like the other two, and every difference is
 * a place an adapter goes wrong:
 *
 *   - the system prompt is a `systemInstruction` object, not a message (§3.1)
 *   - the assistant role is spelled `model`, not `assistant` (§3.2)
 *   - the model goes in the URL path, not the body
 *   - limits live under `generationConfig`, not at the top level
 *
 * The key is sent as `x-goog-api-key`, never as the `?key=` query parameter the
 * Google examples use. A key in a URL ends up in browser history and in any
 * proxy log along the way; 05_API_SPEC.md §8 forbids it.
 */

import type {
  Credentials,
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
import { fetchDiagnosed, readSSE, readErrorBody } from "@/lib/llm/http";

const LABEL = "Google";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MAX_TOKENS = 8192;

interface Part {
  text: string;
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}
interface Body {
  systemInstruction: { parts: Part[] };
  contents: Content[];
  generationConfig: { maxOutputTokens?: number; temperature?: number };
}

function buildBody(req: GenerateRequest, dropped: ReadonlySet<string>): Body {
  const generationConfig: Body["generationConfig"] = {};
  if (!dropped.has("maxOutputTokens")) {
    generationConfig.maxOutputTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  }
  if (!dropped.has("temperature") && req.temperature !== undefined) {
    generationConfig.temperature = req.temperature;
  }

  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.messages.map((m) => ({
      // §3.2: `assistant` is rejected here; the role is `model`.
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig,
  };
}

function base(creds: Credentials): string {
  return (creds.baseUrl ?? BASE_URL).replace(/\/+$/, "");
}

function headers(creds: Credentials): Record<string, string> {
  return { "content-type": "application/json", "x-goog-api-key": creds.apiKey };
}

interface Candidate {
  content?: { parts?: Part[] };
  finishReason?: string;
}
interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}
interface WireResponse {
  candidates?: Candidate[];
  usageMetadata?: UsageMetadata;
  promptFeedback?: { blockReason?: string };
}

function textOf(candidate: Candidate | undefined): string {
  return (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

function usageOf(meta: UsageMetadata | undefined) {
  if (!meta) return undefined;
  if (typeof meta.promptTokenCount !== "number" && typeof meta.candidatesTokenCount !== "number") return undefined;
  return { inputTokens: meta.promptTokenCount ?? 0, outputTokens: meta.candidatesTokenCount ?? 0 };
}

/**
 * Gemini reports policy stops as a `finishReason` or a prompt-level
 * `blockReason`, both of which are HTTP 200 — the same shape of problem as
 * Anthropic's `stop_reason: 'refusal'`, and it deserves the same honest
 * treatment rather than being rendered as an empty answer.
 */
function policyStop(res: WireResponse): string | null {
  const blocked = res.promptFeedback?.blockReason;
  if (blocked) return blocked;

  const reason = res.candidates?.[0]?.finishReason;
  if (reason && reason !== "STOP" && reason !== "MAX_TOKENS" && reason !== "FINISH_REASON_UNSPECIFIED") {
    return reason;
  }
  return null;
}

const google: ModelProvider = {
  id: "google",

  async generate(req: GenerateRequest, creds: Credentials): Promise<GenerateResult> {
    const dropped = new Set<string>();

    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${base(creds)}/models/${encodeURIComponent(req.model)}:generateContent`;
      let res: Response;
      try {
        res = await fetchDiagnosed(
          url,
          { method: "POST", headers: headers(creds), body: JSON.stringify(buildBody(req, dropped)), signal: req.signal },
          LABEL,
        );
      } catch (err) {
        if (req.signal?.aborted) throw abortError();
        throw err;
      }

      if (!res.ok) {
        const bodyText = await readErrorBody(res);
        const param = unsupportedParameter(bodyText);
        if (param && !dropped.has(param)) {
          console.warn(`[${LABEL}] rejected parameter "${param}"; retrying without it.`);
          dropped.add(param);
          continue;
        }
        throw errorFromStatus(res.status, bodyText, LABEL);
      }

      const json = (await res.json()) as WireResponse;
      const stop = policyStop(json);
      if (stop) throw refusalError(stop, LABEL);

      return {
        text: textOf(json.candidates?.[0]),
        usage: usageOf(json.usageMetadata),
        stopReason: json.candidates?.[0]?.finishReason ?? undefined,
      };
    }

    throw appError("PROVIDER_ERROR", `${LABEL}: exhausted parameter-drift retry`);
  },

  async *stream(req: GenerateRequest, creds: Credentials): AsyncGenerator<StreamChunk> {
    const dropped = new Set<string>();

    // No `emitted` guard here, unlike the Anthropic adapter: a drift 400 is an
    // HTTP status, so it is known before the first frame is read.
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${base(creds)}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;

      let res: Response;
      try {
        res = await fetchDiagnosed(
          url,
          { method: "POST", headers: headers(creds), body: JSON.stringify(buildBody(req, dropped)), signal: req.signal },
          LABEL,
        );
      } catch (err) {
        if (req.signal?.aborted) throw abortError();
        throw err;
      }

      if (!res.ok) {
        const bodyText = await readErrorBody(res);
        const param = unsupportedParameter(bodyText);
        if (param && !dropped.has(param)) {
          console.warn(`[${LABEL}] rejected parameter "${param}"; retrying without it.`);
          dropped.add(param);
          continue;
        }
        throw errorFromStatus(res.status, bodyText, LABEL);
      }

      if (!res.body) throw appError("PROVIDER_ERROR", `${LABEL}: response had no body`);

      let usage: { inputTokens: number; outputTokens: number } | undefined;
      let stop: string | null = null;

      for await (const frame of readSSE(res.body)) {
        let chunk: WireResponse;
        try {
          chunk = JSON.parse(frame.data);
        } catch {
          continue;
        }

        const text = textOf(chunk.candidates?.[0]);
        if (text !== "") {
          yield { type: "text", value: text };
        }

        const u = usageOf(chunk.usageMetadata);
        if (u) usage = u;

        const policy = policyStop(chunk);
        if (policy) stop = policy;
      }

      if (stop) {
        yield { type: "error", error: refusalError(stop, LABEL) };
        return;
      }

      if (usage) yield { type: "usage", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
      yield { type: "done" };
      return;
    }
  },

  async validate(creds: Credentials): Promise<ValidateResult> {
    try {
      const res = await fetchDiagnosed(`${base(creds)}/models`, { method: "GET", headers: headers(creds) }, LABEL);

      if (!res.ok) {
        return { ok: false, error: errorFromStatus(res.status, await readErrorBody(res), LABEL) };
      }

      const json = (await res.json()) as { models?: Array<{ name?: string }> };
      const models = (json.models ?? [])
        .map((m) => m.name?.replace(/^models\//, ""))
        .filter((id): id is string => typeof id === "string" && id !== "");

      return { ok: true, models };
    } catch (err) {
      if (isAppError(err)) return { ok: false, error: err };
      return { ok: false, error: appError("PROVIDER_ERROR", `${LABEL}: ${String(err)}`) };
    }
  },
};

export default google;
