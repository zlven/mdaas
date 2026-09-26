/**
 * Shared transport helpers for the provider adapters.
 *
 * Two things every adapter needs and none of them should reimplement:
 *
 *   - SSE frame parsing (05_API_SPEC.md §3, 02_TECH_SPEC.md §6.3). `EventSource`
 *     is not usable here: it cannot issue a POST or carry a request body.
 *   - Telling CORS apart from a network outage (02_TECH_SPEC.md §6.6). Both
 *     surface as `TypeError: Failed to fetch`, and reporting "check your
 *     connection" to a user whose real problem is CORS sends them debugging the
 *     wrong thing. This is a cost the user pays in confusion, so it is worth the
 *     extra probe.
 */

import { abortError, appError, errorFromStatus } from "@/lib/llm/errors";

export interface SSEFrame {
  event: string;
  data: string;
}

/**
 * Parses one SSE frame. Returns null for frames carrying no data (comments,
 * `ping`, bare field lines) so callers can skip them without a branch.
 */
function parseFrame(raw: string): SSEFrame | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line === "" || line.startsWith(":")) continue;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/**
 * Reads a `text/event-stream` body frame by frame.
 *
 * Buffers across chunk boundaries on purpose: a frame can be split anywhere,
 * including in the middle of the blank-line separator, and a parser that
 * assumes one chunk equals one frame works in testing and fails under load.
 */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEFrame, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const separator = /\r?\n\r?\n/.exec(buffer);
        if (!separator || separator.index === undefined) break;

        const raw = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);

        const frame = parseFrame(raw);
        if (frame) yield frame;
      }
    }

    // A final frame with no trailing blank line is still a frame.
    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Checks whether a host is reachable at all, ignoring CORS.
 *
 * `mode: 'no-cors'` always resolves opaquely when the host answers, and rejects
 * when it does not — which is exactly the bit the original failure could not
 * tell us. The response is unreadable by design; only reachability matters.
 */
async function hostReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { mode: "no-cors", method: "GET", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

/**
 * `fetch` that resolves the CORS/offline ambiguity before reporting.
 *
 * Returns the Response even when `res.ok` is false — mapping a status onto an
 * ErrorCode needs the body, and that differs per provider (§7).
 */
export async function fetchDiagnosed(
  url: string,
  init: RequestInit,
  providerLabel: string,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    // An abort surfaces as a rejected fetch. Check it first: reporting it as a
    // network failure would be wrong and would also fire the reachability probe
    // for a request the user deliberately cancelled.
    if (init.signal?.aborted) throw abortError();

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw appError("NETWORK_UNAVAILABLE", `${providerLabel}: navigator.onLine === false`);
    }

    const reachable = await hostReachable(url);
    if (reachable) {
      throw appError(
        "CORS_BLOCKED",
        `${providerLabel}: fetch rejected but host is reachable — the origin was refused`,
      );
    }

    throw appError(
      "NETWORK_UNAVAILABLE",
      `${providerLabel}: fetch rejected and host is unreachable (${String(cause)})`,
    );
  }
}

/**
 * Reads a non-OK response body for diagnosis.
 *
 * Truncated so a provider returning a full HTML error page cannot blow up the
 * UI, and so the body never becomes something worth storing. The text is used
 * for status mapping and `detail` only — never rendered to the user (§9).
 */
export async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

/** Throws the mapped AppError for a non-OK response. */
export async function throwForStatus(res: Response, providerLabel: string): Promise<never> {
  throw errorFromStatus(res.status, await readErrorBody(res), providerLabel);
}
