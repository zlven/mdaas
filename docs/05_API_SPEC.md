# 05 — API Specification

| Field | Value |
|---|---|
| Doc version | 1.0 |
| Last updated | 2026-09-26 |
| Scope | Provider adapters (browser → LLM) + the optional forwarding proxy |

---

## 1. There is no platform API

`project_plan/软件规格说明书.md` §48 specifies a REST API (`/api/v1/chat`, `/api/v1/agents/run`, …). **That does not exist in this architecture** and must not be built — every one of those endpoints implies a server (`02_TECH_SPEC.md` C1).

What replaces it:

```
Components
   ↓  (only through the gateway — never fetch a provider directly)
ModelGateway                       lib/llm/gateway.ts
   ↓
ModelProvider adapters             lib/llm/providers/*
   ↓
Browser fetch → LLM provider       the user's own account
```

This document specifies **that** boundary: the adapter contract, each provider's wire format, the optional proxy, and the error mapping.

The internal interfaces (`GenerateRequest`, `ModelProvider`, `StreamChunk`, `AppError`) are defined in `02_TECH_SPEC.md` §6 and are not repeated here.

---

## 2. Provider matrix

| Provider | `ProviderId` | Base URL | Auth | Browser-direct |
|---|---|---|---|---|
| OpenAI | `openai` | `https://api.openai.com/v1` | `Authorization: Bearer <key>` | Yes |
| Anthropic | `anthropic` | `https://api.anthropic.com/v1` | `x-api-key: <key>` | Yes, with a required header (§4.2) |
| Google Gemini | `google` | `https://generativelanguage.googleapis.com/v1beta` | `x-goog-api-key: <key>` | Yes |
| OpenAI-compatible | `compatible` | user-supplied | `Authorization: Bearer <key>` | **Assume no** (§6) |

**Every adapter's parameter surface must be verified against the provider's current documentation before it is trusted.** Provider APIs drift, and the drift is silent in the worst cases — a removed parameter returns a 400 that looks like a bug in your code. §3.4 documents a live example that already caught this project out once.

---

## 3. Common adapter obligations

Each adapter implements `ModelProvider` (`02_TECH_SPEC.md` §6) and must:

1. Map the gateway's `GenerateRequest` onto its provider's wire format.
2. Map the provider's stream onto `StreamChunk`.
3. Map every failure onto a typed `AppError` with an `ErrorCode` (§7). **Never** let a provider's raw error body or an SDK error string reach the UI.
4. Report token usage when the provider supplies it.
5. Respect `AbortSignal` — an aborted request must stop the network request, not just stop rendering.

### 3.1 System prompt placement

The three providers disagree about where a system prompt goes. This is the single most common adapter bug.

| Provider | Placement |
|---|---|
| OpenAI | a message with `role: "system"` at the head of `messages` |
| Anthropic | the **top-level `system` field** — not a message |
| Google | a separate **`systemInstruction`** object — not a message |
| compatible | `role: "system"` message (OpenAI shape) |

### 3.2 Role naming

| Gateway role | OpenAI / compatible | Anthropic | Google |
|---|---|---|---|
| `user` | `user` | `user` | `user` |
| `assistant` | `assistant` | `assistant` | **`model`** |
| `system` | `system` (as a message) | top-level field | `systemInstruction` |

### 3.3 Required-field traps

- **Anthropic: `max_tokens` is required.** Omitting it is a 400, not a default.
- **Anthropic: the first message must be `user`.** Consecutive same-role messages are fine (the API merges them).
- **OpenAI: `max_tokens` has diverged.** Some newer models require `max_completion_tokens` and reject `max_tokens`. The adapter must tolerate both — see §3.4.
- **Anthropic, current models: `temperature` / `top_p` / `top_k` are removed and return a 400.** See §3.4.
- **Google: roles are `user` / `model`.** `assistant` is rejected.

### 3.4 Handling parameter drift — a rule, not a suggestion

**Reading a provider's parameter surface off an older model is how integrations break.** Recorded here because it already happened during this project's design:

> An earlier revision of `02_TECH_SPEC.md` gave each model profile a `temperature`, applied uniformly. Against every current Anthropic model that is a **400** — `temperature` was removed from the current generation. The design looked entirely reasonable and would have failed on the first request.

Therefore:

1. Any adapter that sends a sampling or limit parameter must have a **per-model capability check** for it, defaulting to *omit* when the model's generation is unknown.
2. When a provider returns a 400 whose body names an unsupported parameter, the adapter should **drop that parameter and retry once** before surfacing an error. This makes the integration resilient to drift without a hardcoded table that goes stale.
3. The retry must be logged (locally, without credentials) so the capability table can be corrected.

Verified position for this project:

| Provider family | `temperature` | Depth control | Output limit |
|---|---|---|---|
| Anthropic current (Opus 5 / 5.5, Sonnet 5, Fable 5 / 5.1, Opus 4.8 / 4.7) | **Rejected (400)** | `output_config.effort` | `max_tokens` (required) |
| Anthropic Opus 4.6 / Sonnet 4.6 / Haiku 4.5 and older | Accepted | `thinking.budget_tokens` (legacy) | `max_tokens` (required) |
| OpenAI | Accepted | — | `max_tokens` or `max_completion_tokens` — model-dependent |
| Google | Accepted | — | `generationConfig.maxOutputTokens` |
| compatible | Accepted | — | `max_tokens` |

**Thinking on current Anthropic models is on by default.** See `02_TECH_SPEC.md` §6.4.1 for the latency consequence and the effort tuning that addresses it.

---

## 4. Anthropic

### 4.1 Use the official SDK

`npm install @anthropic-ai/sdk`. Do not hand-roll the wire format for this provider — the SDK carries the typed error classes (§7), stream event handling, and the browser flag. Use SDK types (`Anthropic.MessageParam`, `Anthropic.Message`) rather than redefining equivalents.

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey,                        // the user's key, from browser storage
  dangerouslyAllowBrowser: true, // required in a browser context
});
```

### 4.2 Browser access

Anthropic rejects browser-origin requests by default. The request must carry:

```
anthropic-dangerous-direct-browser-access: true
```

The SDK sets this when initialized for browser use. **A request missing it is indistinguishable, in JavaScript, from a network outage** — both surface as a generic `TypeError` (see `02_TECH_SPEC.md` §6.6).

### 4.3 Request shape

```ts
await client.messages.create({
  model,                                  // e.g. 'claude-opus-5'
  max_tokens,                             // REQUIRED
  system,                                 // top-level, NOT a message
  messages,                               // first must be role: 'user'
  thinking: { type: 'adaptive' },         // current models: adaptive only
  output_config: { effort },              // low | medium | high | xhigh | max
  // NO temperature / top_p / top_k on current models — 400
});
```

Current model IDs, for the Settings suggestion list:

| Model | ID | Context |
|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K |
| Claude Fable 5.1 | `claude-fable-5-1` | 1M |

Use these IDs exactly. Do not append date suffixes.

**The model field must remain free text with suggestions, not a closed dropdown.** Model IDs ship faster than this app will be updated; a closed list strands users on stale models.

### 4.4 Streaming events

SSE. Event types the adapter must handle:

| Event | Handling |
|---|---|
| `message_start` | capture input usage |
| `content_block_start` | — |
| `content_block_delta` | `delta.type === 'text_delta'` → emit `{type:'text', value: delta.text}` |
| `content_block_stop` | — |
| `message_delta` | carries `stop_reason` and output usage |
| `message_stop` | emit `{type:'done'}` |
| `ping` | ignore |
| `error` | map to `AppError` |
| `thinking` blocks | **ignore** — not surfaced in this product |

### 4.5 Refusals

`stop_reason: 'refusal'` is a **successful HTTP 200** carrying a policy decline, with detail on `stop_details.category`. The adapter must check `stop_reason` before reading content and map a refusal to a distinct, honest user-facing message — not an empty answer, and not a generic error.

---

## 5. Credential validation

`ModelProvider.validate(creds)` powers the **Verify** button in Settings (`03_UI_UX_SPEC.md` §8). Rules:

1. **Cheapest possible call.** Prefer a list-models endpoint over a generation.
2. **Never** send the user's prompt, conversation, or any personal data.
3. Return a typed result; never throw for an expected auth failure.

| Provider | Validation call | Cost |
|---|---|---|
| OpenAI | `GET /models` | free |
| Anthropic | `GET /v1/models` | free |
| Google | `GET /models` | free |
| compatible | `GET {baseURL}/models`; if 404, a minimal chat completion | free / negligible |

```ts
type ValidateResult =
  | { ok: true; models: string[] }
  | { ok: false; error: AppError };
```

The returned model list, when available, populates the Settings suggestions. Where the endpoint is unsupported (some `compatible` providers), validation falls back to a one-token generation — and the UI must say that verifying costs a negligible amount rather than implying it is free.

---

## 6. The optional forwarding proxy

Needed only for `compatible` providers that block browser origins. A single Cloudflare Worker on the free tier. **It is a pipe, not a service**: it holds no credentials of its own and stores nothing.

### 6.1 Contract

```
POST <worker-url>
  x-target-url: https://api.deepseek.com/v1/chat/completions
  x-target-auth: <the user's key>          ← worker forwards, never persists
  content-type: application/json

  <the provider's request body, verbatim>
```

The worker:
1. Validates `x-target-url` against its **host allowlist** (§6.2).
2. Rejects anything else with `403`.
3. Forwards the request with the auth header the target provider expects.
4. Streams the provider's response back, unmodified, including SSE.
5. Sets CORS headers for the app's own origin(s) only.
6. Answers `OPTIONS` preflight.
7. Holds no state. Logs nothing containing `x-target-auth`.

### 6.2 The allowlist is mandatory, not a hardening step

**An unrestricted forwarding proxy is an open proxy.** Anyone who finds the URL can route arbitrary traffic through it under the owner's Cloudflare account — abusing the free tier, and potentially the owner's reputation and quota.

The worker **must** carry a hardcoded host allowlist, and must reject any `x-target-url` whose host is not on it. The list is edited by the owner and redeployed; it is not user-configurable at runtime.

```ts
const ALLOWED_HOSTS = [
  'api.deepseek.com',
  'api.moonshot.cn',
  'ark.cn-beijing.volces.com',
  'dashscope.aliyuncs.com',
  // owner adds hosts here
];
```

Also required:
- Restrict `Access-Control-Allow-Origin` to the app's own origins. A wildcard makes the open-proxy problem worse.
- Cap request body size.
- A basic per-IP rate limit, so one abusive client cannot exhaust the daily quota for everyone.
- Never echo the request back in an error message — request bodies contain user content.

### 6.3 Failure behaviour

If the proxy is unreachable, direct providers are unaffected. Only `compatible` providers fail, and they must fail with a message that names the proxy as the cause rather than reporting a generic network error.

`06_ACCEPTANCE.md` §H6 covers this.

---

## 7. Error mapping

Every provider failure lands on an `ErrorCode` from `02_TECH_SPEC.md` §6.5. Adapters map; the UI renders. Never string-match an error message to decide behaviour — use typed classes (SDK) or status codes (raw HTTP).

| HTTP / condition | `ErrorCode` |
|---|---|
| 400, body names an unsupported parameter | drop the parameter, retry once (§3.4); if it recurs → `PROVIDER_ERROR` |
| 400, other | `PROVIDER_ERROR` |
| 401, 403 | `INVALID_CREDENTIALS` |
| 404 (model) | `MODEL_NOT_FOUND` |
| 413, `context_length_exceeded` | `CONTEXT_TOO_LONG` |
| 429 | `RATE_LIMITED` |
| 402 / quota message | `INSUFFICIENT_QUOTA` |
| 5xx | `PROVIDER_ERROR` |
| fetch rejects + host reachable | `CORS_BLOCKED` |
| fetch rejects + host unreachable | `NETWORK_UNAVAILABLE` |
| `AbortSignal` fired | `ABORTED` |
| Anthropic `stop_reason: 'refusal'` | `PROVIDER_ERROR` with the refusal category surfaced |
| No key configured | `NO_CREDENTIALS` (raised by the gateway, never reaches a provider) |

User-facing copy for each code is specified in `01_PRD.md` §9. All copy is Chinese; no provider error string is ever shown verbatim.

---

## 8. What must never cross this boundary

- The user's API key, to any host other than the one they configured (or their own proxy).
- Any key, into a log, an error message, a URL, an analytics event, or a crash report.
- Conversation content, uploaded file content, or retrieved knowledge, to any host other than the configured provider.
- A full key into the UI (`03_UI_UX_SPEC.md` §8).

`06_ACCEPTANCE.md` §I tests these.
