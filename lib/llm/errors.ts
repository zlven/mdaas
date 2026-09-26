/**
 * Typed errors — docs/02_TECH_SPEC.md §6.5, docs/05_API_SPEC.md §7
 *
 * Every provider failure lands on an ErrorCode. Adapters map; the UI renders.
 *
 * Two rules this file exists to enforce:
 *
 *   1. No raw stack trace, provider JSON error body, or English SDK string ever
 *      reaches the user (01_PRD.md §9). The `message` is Chinese and actionable;
 *      everything developer-facing goes in `detail`.
 *   2. Behaviour is decided by typed classes or status codes, never by
 *      string-matching an error message.
 *
 * Nothing here may contain a credential. `detail` is shown in a debug drawer.
 */

export type ErrorCode =
  | "NO_CREDENTIALS"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "INSUFFICIENT_QUOTA"
  | "MODEL_NOT_FOUND"
  | "CONTEXT_TOO_LONG"
  | "CORS_BLOCKED"
  | "NETWORK_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "RETRIEVAL_FAILED"
  | "PARSE_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "ABORTED";

/**
 * The repair the UI can offer alongside the message. A code without a remedy
 * would leave the user with an explanation and nothing to do, which the PRD's
 * error table (§9) does not allow.
 */
export type Remedy =
  | { kind: "open-settings" }
  | { kind: "reenter-key" }
  | { kind: "switch-model" }
  | { kind: "open-proxy-settings" }
  | { kind: "retry" }
  | { kind: "new-conversation" };

export interface AppError {
  code: ErrorCode;
  /** User-facing. Chinese, actionable. */
  message: string;
  /** Developer-facing. May name the provider and status. Never a credential. */
  detail?: string;
  remedy?: Remedy;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AppError).code === "string" &&
    typeof (value as AppError).message === "string"
  );
}

/**
 * Constructs an AppError with the standard Chinese copy for its code.
 *
 * Copy lives here rather than at each call site so the same failure reads the
 * same way wherever it surfaces — the settings drawer and the chat pane show the
 * same wording for an invalid key.
 */
export function appError(code: ErrorCode, detail?: string, overrides?: Partial<AppError>): AppError {
  return { code, message: DEFAULT_MESSAGE[code], remedy: DEFAULT_REMEDY[code], detail, ...overrides };
}

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  NO_CREDENTIALS:
    "还没有配置 API Key。这个产品用的是你自己的 Key，它存在你的浏览器里，不经过我们的服务器。",
  INVALID_CREDENTIALS:
    "服务商拒绝了这把 Key。可能是复制不完整、已失效，或者被撤销了。请到设置里重新填写。",
  RATE_LIMITED: "请求太频繁，被服务商限流了。等一会儿再试，或者换一个模型。",
  INSUFFICIENT_QUOTA:
    "这个服务商账户的额度用完了。这是你自己账户上的限制，需要到服务商那边充值或调整额度。",
  MODEL_NOT_FOUND:
    "找不到这个模型。可能是名字写错了，或者你的账户没有开通它。请到设置里从模型列表中选一个。",
  CONTEXT_TOO_LONG:
    "这次的内容超出了模型的上下文长度。可以去掉一个附件，或者开一段新的对话。",
  CORS_BLOCKED:
    "服务商拒绝了这个网页发起的直接请求（CORS），这不是网络故障。可以在设置里配置转发代理，或者换一个允许浏览器直连的服务商。",
  NETWORK_UNAVAILABLE: "网络连接不上。检查一下网络，然后重试。",
  PROVIDER_ERROR: "服务商返回了错误。这通常是暂时的，稍后重试即可。",
  RETRIEVAL_FAILED: "知识库没能加载，这次的回答没有引用知识库。",
  PARSE_FAILED: "文件读不出来。",
  // Storage, not the provider. Neither of these is fixable from an error card,
  // so neither borrows a provider code: PROVIDER_ERROR would tell the user to
  // retry the provider, PARSE_FAILED talks about reading a file, and
  // RETRIEVAL_FAILED would have the app claim the knowledge base broke.
  STORAGE_UNAVAILABLE:
    "浏览器不允许这个页面保存数据（隐私模式或站点数据被拦截时会出现）。档案只在本次打开期间有效，刷新后会丢失。",
  // Distinct from STORAGE_UNAVAILABLE, and the difference is not cosmetic: here
  // the store opened, so a profile may exist that we simply could not read. That
  // is why the form is locked rather than session-only-and-editable — and saying
  // 「刷新后会丢失」 to someone whose data is still on disk would be false.
  STORAGE_READ_FAILED:
    "浏览器里可能存着这个专家的档案，但这次没能读出来。现在不能编辑，以免覆盖掉原有的内容。刷新页面可以再试一次。",
  STORAGE_WRITE_FAILED: "这次修改没能存进浏览器。更早保存的内容还在，可以重试。",
  ABORTED: "已取消。",
};

const DEFAULT_REMEDY: Record<ErrorCode, Remedy | undefined> = {
  NO_CREDENTIALS: { kind: "open-settings" },
  INVALID_CREDENTIALS: { kind: "reenter-key" },
  RATE_LIMITED: { kind: "retry" },
  INSUFFICIENT_QUOTA: { kind: "switch-model" },
  MODEL_NOT_FOUND: { kind: "switch-model" },
  CONTEXT_TOO_LONG: { kind: "new-conversation" },
  CORS_BLOCKED: { kind: "open-proxy-settings" },
  NETWORK_UNAVAILABLE: { kind: "retry" },
  PROVIDER_ERROR: { kind: "retry" },
  // Retrieval and parse failures are reported inline; there is nothing to
  // repair from an error card, and the answer continues without knowledge.
  RETRIEVAL_FAILED: undefined,
  PARSE_FAILED: undefined,
  // What has to change is a browser setting, and the message already says so.
  STORAGE_UNAVAILABLE: undefined,
  // The repair is a page reload, which is not a control we can put in a card.
  STORAGE_READ_FAILED: undefined,
  // The library opened and read fine; one write did not land. Retrying is a real
  // action — the user may free up quota, and the next attempt may succeed.
  STORAGE_WRITE_FAILED: { kind: "retry" },
  ABORTED: undefined,
};

/**
 * A policy decline from a provider.
 *
 * This is a successful HTTP 200 carrying a refusal (05_API_SPEC.md §4.5), so it
 * is not a transport failure and must not read like one. It maps to
 * PROVIDER_ERROR per §7, with the policy category in `detail` and a message that
 * says plainly what happened.
 */
export function refusalError(category: string | null, providerLabel: string): AppError {
  const parts = [`${providerLabel}拒绝回答这个问题。这是服务商的安全策略，不是网络或配置问题。`];
  if (category) parts.push(`触发类别：${category}。`);
  parts.push("可以换一种问法，或者换一个模型再试。");
  return {
    code: "PROVIDER_ERROR",
    message: parts.join(""),
    remedy: { kind: "retry" },
    detail: `refusal (stop_reason=refusal, category=${category ?? "unknown"})`,
  };
}

export function abortError(): AppError {
  return appError("ABORTED");
}

/**
 * The four upload refusals — docs/02_TECH_SPEC.md §8.7, `01_PRD.md` §6.
 *
 * One `ErrorCode` (`PARSE_FAILED`) with four messages, rather than four codes.
 * The distinction the user needs is *which file* and *why*, and both are in the
 * message; separate codes would widen §6.5's table and the PRD §9 row without
 * changing what anyone sees.
 *
 * All four carry `remedy: undefined`, inherited from `PARSE_FAILED`: the file
 * failed, the answer is not blocked by it, and there is nothing to repair from an
 * error card. They are rendered on the file's own chip, because a failure belongs
 * to one file — two files can fail for two different reasons in the same turn.
 *
 * Each message names the file, per `01_PRD.md` §6: "A parsing failure names the
 * file and the reason. It never fails silently."
 */
export function fileTooLargeError(name: string, actual: string, limit: string): AppError {
  return appError("PARSE_FAILED", `oversized: ${actual} > ${limit}`, {
    message: `「${name}」有 ${actual}，超过了 ${limit} 的上限。这个文件没有被读取。`,
  });
}

export function fileFormatUnsupportedError(name: string, accepted: string): AppError {
  return appError("PARSE_FAILED", `unsupported extension`, {
    message: `「${name}」不是支持的格式。可以上传 ${accepted}。`,
  });
}

/**
 * E9. A scanned or image-only PDF, which yields no text layer at all.
 *
 * Says "可能是" rather than asserting it: the extraction can also come back
 * nearly empty from an unusual encoding, and telling someone their file is a
 * scan when it is not would send them to re-scan a document they already have.
 */
export function fileNoTextError(name: string): AppError {
  return appError("PARSE_FAILED", `no extractable text`, {
    message: `「${name}」里没有可提取的文字，可能是扫描件或图片型 PDF。这类文件需要先做文字识别。`,
  });
}

/** The parser itself threw: a corrupt file, or a format the library could not handle. */
export function fileUnreadableError(name: string, reason: string): AppError {
  return appError("PARSE_FAILED", reason, {
    message: `「${name}」读不出来。文件可能已经损坏，或者不是它扩展名所说的格式。`,
  });
}

/**
 * Maps an HTTP status onto an ErrorCode — docs/05_API_SPEC.md §7.
 *
 * `bodyText` is used only to distinguish cases the status alone cannot express
 * (a context-length error arriving as a 400, a quota error arriving as a 402).
 * It is never surfaced to the user.
 */
export function errorFromStatus(status: number, bodyText: string, providerLabel: string): AppError {
  const detail = `${providerLabel} HTTP ${status}`;
  const lower = bodyText.toLowerCase();

  if (status === 401 || status === 403) return appError("INVALID_CREDENTIALS", detail);

  if (status === 404) return appError("MODEL_NOT_FOUND", detail);

  if (status === 429) return appError("RATE_LIMITED", detail);

  if (status === 402) return appError("INSUFFICIENT_QUOTA", detail);

  if (status === 413 || lower.includes("context_length") || lower.includes("context length") || lower.includes("too many tokens")) {
    return appError("CONTEXT_TOO_LONG", detail);
  }

  if (status === 400) {
    if (lower.includes("quota") || lower.includes("insufficient_quota") || lower.includes("billing")) {
      return appError("INSUFFICIENT_QUOTA", detail);
    }
    return appError("PROVIDER_ERROR", detail);
  }

  if (status >= 500) return appError("PROVIDER_ERROR", detail);

  return appError("PROVIDER_ERROR", detail);
}

/**
 * Detects a 400 that names a parameter the model does not accept.
 *
 * This is the drift guard from 05_API_SPEC.md §3.4: provider parameter surfaces
 * change, and a removed parameter returns a 400 that looks like a bug in our
 * code. When the body names one, the adapter drops it and retries once instead
 * of failing a request that would have worked.
 *
 * Returns the parameter name, or null.
 */
export function unsupportedParameter(bodyText: string): string | null {
  const lower = bodyText.toLowerCase();

  // Anthropic: "Unexpected parameter: temperature" / OpenAI: "Unrecognized request argument supplied: temperature"
  const named =
    /unexpected parameter[:\s]+`?([a-z0-9_.]+)`?/.exec(lower) ??
    /unrecognized request argument[^:]*:\s*`?([a-z0-9_.]+)`?/.exec(lower) ??
    /unsupported parameter[:\s]+`?([a-z0-9_.]+)`?/.exec(lower) ??
    /`?([a-z0-9_.]+)`?\s+is not supported/.exec(lower);

  if (named?.[1]) return named[1];

  // Some providers do not name it in a parseable way; fall back to the
  // parameters we know are drift-prone and check for a mention.
  for (const param of ["temperature", "top_p", "top_k", "max_tokens"]) {
    if (lower.includes(param) && (lower.includes("not supported") || lower.includes("unsupported") || lower.includes("unexpected") || lower.includes("unrecognized"))) {
      return param;
    }
  }

  return null;
}
