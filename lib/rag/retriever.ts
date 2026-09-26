/**
 * Per-agent retrieval — docs/02_TECH_SPEC.md §8.5, §8.7
 *
 * The only module in the codebase that fetches a knowledge index, and it fetches
 * exactly one: the agent whose id it was given. Isolation between agents is
 * structural, not a filter over a shared corpus (§8.7) — there is no code path
 * here that can reach a second agent's file, because the agent id is the only
 * input and the URL is built from it directly.
 *
 * E6 is the acceptance criterion that keeps it that way: the network panel must
 * show a single `/knowledge/<agentId>.json`. The manifest is deliberately *not*
 * fetched — it names every agent and their chunk counts, and downloading it
 * would turn a structural guarantee back into a filter.
 */

import { appError } from "@/lib/llm/errors";
import { buildIndex, search, type RetrievedChunk } from "@/lib/rag/bm25";
import type { Chunk } from "@/lib/rag/chunk";

/**
 * GitHub Pages project sites serve the app from a subpath, so `public/` is not
 * at the origin root and a bare `fetch("/knowledge/x.json")` would 404 there
 * while working perfectly in local development. Next rewrites `<Link>` and asset
 * URLs for `basePath` on its own; it does not rewrite a fetch we write by hand,
 * which is the whole reason this constant exists.
 *
 * `next.config.ts` reads the same variable for `basePath`/`assetPrefix`, and CI
 * sets it to the repository name. Locally it is unset and this is empty.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface Retriever {
  readonly agentId: string;
  /** Top chunks clearing the score floor. Empty is a normal, expected result. */
  retrieve(query: string, k?: number): RetrievedChunk[];
}

interface IndexPayload {
  agentId: string;
  version: string;
  chunks: Chunk[];
}

function isChunk(value: unknown): value is Chunk {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<Chunk>;
  return typeof c.id === "string" && typeof c.text === "string" && typeof c.source === "string" && Array.isArray(c.tags);
}

async function fetchChunks(agentId: string): Promise<Chunk[]> {
  const url = `${BASE_PATH}/knowledge/${agentId}.json`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw appError("RETRIEVAL_FAILED", `fetch failed: ${url} — ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    throw appError("RETRIEVAL_FAILED", `${url} → HTTP ${res.status}`);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw appError("RETRIEVAL_FAILED", `${url} → response was not JSON`);
  }

  const index = payload as Partial<IndexPayload>;

  // The index carries the id it was built for. Checking it catches the
  // misconfiguration that would otherwise be invisible: a wrong base path or a
  // stale artefact serving one agent's knowledge under another agent's URL. The
  // answer would look plausible and be about the wrong domain, which is exactly
  // the failure E4 and E5 exist to prevent.
  if (index.agentId !== agentId) {
    throw appError(
      "RETRIEVAL_FAILED",
      `${url} → index is for agent "${String(index.agentId)}", not "${agentId}"`,
    );
  }

  if (!Array.isArray(index.chunks) || !index.chunks.every(isChunk)) {
    throw appError("RETRIEVAL_FAILED", `${url} → index has no valid chunks array`);
  }

  return index.chunks;
}

const retrieverCache = new Map<string, Promise<Retriever>>();

/**
 * Loads and caches an agent's retriever for the session (§8.5).
 *
 * The promise is cached rather than its result, so two components mounting at
 * once share one fetch instead of racing two.
 *
 * A failure evicts the cache entry. Retrieval failure is not fatal — the answer
 * continues without knowledge (§8.8, and the RETRIEVAL_FAILED copy says so) — so
 * the next message must be able to try again rather than being poisoned for the
 * rest of the session by one bad moment on the network.
 */
export function loadAgentRetriever(agentId: string): Promise<Retriever> {
  const cached = retrieverCache.get(agentId);
  if (cached) return cached;

  const pending = fetchChunks(agentId)
    .then((chunks) => {
      const index = buildIndex(chunks);
      const retriever: Retriever = {
        agentId,
        retrieve: (query: string, k?: number) => search(index, query, k),
      };
      return retriever;
    })
    .catch((err: unknown) => {
      retrieverCache.delete(agentId);
      throw err;
    });

  retrieverCache.set(agentId, pending);
  return pending;
}
