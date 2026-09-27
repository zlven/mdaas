/**
 * Attachments and 资料夹 documents as reference material — docs/02_TECH_SPEC.md §8.7
 *
 * Extracted from `components/chat/Workspace.tsx` so that a chat turn and a
 * workflow step build their reference block the same way. Two copies of this
 * would not stay equal: the workflow path is the newer one, and the assertions
 * that guard the inline budget and the overflow (06_ACCEPTANCE.md E11, E12)
 * would quietly stop covering it.
 *
 * Three rules, each load-bearing:
 *
 *   1. **An attachment is not retrieval.** §8.7 — the head of every ready file is
 *      injected verbatim, so it reaches the model whether or not it matches the
 *      question; only the overflow past the inline budget is searched. A
 *      retrieval-only design cannot satisfy every agent prompt's 「先说明你读到了
 *      什么」, because an agent cannot describe a document it was never shown.
 *   2. **`score: 0` marks the injected head as something other than a match.**
 *      `formatContext` renders hits in array order, and the injected head is
 *      ordered before the searched overflow by construction rather than by score.
 *   3. **Each pool is searched separately.** A shared index would normalise the
 *      score distributions against each other, and a long knowledge corpus would
 *      push every upload hit below `SCORE_FLOOR_RATIO`. The pools are
 *      concatenated by the caller, in the order the prompt numbers them.
 *
 * **A saved document is the same object as an attachment with a longer life**, so
 * it goes through the same three rules rather than through a parallel path. The
 * one rule it adds is the per-document toggle, and that is a difference in *which
 * chunks enter the pool*, not in how they are searched or rendered.
 *
 * Nothing here is gated on the agent having a knowledge base: five of the nine
 * agents have none, and every one of them can read a file the user hands it.
 */

import type { LibraryDocument } from "@/lib/files/library";
import type { Upload } from "@/lib/files/types";
import { buildIndex, search, type RetrievedChunk } from "@/lib/rag/bm25";
import type { Chunk } from "@/lib/rag/chunk";

/**
 * The one place a set of chunks becomes hits. Both pools go through it, so the
 * `avgLength === 0` and empty-corpus cases cannot be handled in one and forgotten
 * in the other.
 *
 * Synchronous, and over material already in memory — no fetch, no failure mode.
 * An empty pool means an empty search, not an error.
 */
function searchChunks(chunks: readonly Chunk[], query: string): RetrievedChunk[] {
  if (chunks.length === 0) return [];
  return search(buildIndex([...chunks]), query);
}

/**
 * The reference hits one set of attachments contributes to a request.
 *
 * `query` is what the overflow is searched with — the user's message for a chat
 * turn, `${input}\n${step prompt}` for a workflow step.
 */
export function uploadHits(uploads: readonly Upload[], query: string): RetrievedChunk[] {
  const injected: RetrievedChunk[] = uploads.flatMap((upload) =>
    upload.status.kind === "ready" ? [{ chunk: upload.status.document, score: 0 }] : [],
  );

  const tails = uploads.flatMap((upload) => (upload.status.kind === "ready" ? upload.status.tail : []));

  return [...injected, ...searchChunks(tails, query)];
}

/**
 * The pool one folder contributes, **keyed on the array the store handed out**.
 *
 * This cache is not an optimisation of a cheap thing. `driveRun` rebuilds its
 * reference block once per workflow step — seven times for `creator-30day` — over
 * a pool holding up to five whole documents, and rebuilding a BM25 index over
 * that on every step is work the user waits for on the main thread.
 *
 * Keying on the array's identity is what makes invalidation structural rather
 * than a discipline: the store replaces `documents` only when something changes
 * (`lib/store/library.ts`), so a stale entry is unreachable by construction, and
 * the entry is collected with the array it describes. A `{ agentId, updatedAt }`
 * key would need every writer to remember to bump it.
 *
 * `WeakMap` and not `Map`: nothing here should keep a document list alive.
 */
const POOL_CACHE = new WeakMap<readonly LibraryDocument[], Chunk[]>();

function libraryPool(library: readonly LibraryDocument[]): Chunk[] {
  const cached = POOL_CACHE.get(library);
  if (cached) return cached;

  const pool: Chunk[] = [];
  for (const doc of library) {
    // **An excluded document is still searched — head and tail both.** Its head
    // is the first `LIBRARY_INLINE_BUDGET_CHARS` of the document, which is
    // exactly the part a user is most likely to ask about, and if exclusion
    // removed it from every path then turning a document off would make its
    // opening unreachable rather than merely un-inlined. The toggle trades
    // presence for cost (§8.7), not availability for unavailability — the panel
    // says so in as many words, and this line is what makes that true.
    if (!doc.include) pool.push(doc.document);
    pool.push(...doc.tail);
  }

  POOL_CACHE.set(library, pool);
  return pool;
}

/**
 * The reference hits one turn contributes: this turn's attachments, then the
 * folder.
 *
 * **Order is the contract**, because the prompt numbers these `[1]`…`[n]`:
 *
 *   1. the attachments, through `uploadHits` unchanged;
 *   2. the included documents' heads, `score: 0`, in the store's stored order;
 *   3. the folder's matches.
 *
 * The attachment comes first because it is what *this turn* is about, and the
 * folder is standing context; the folder comes before the knowledge base for the
 * reason `Workspace.tsx` already gives — the user's own material outranks the
 * curated corpus. Within the folder, the heads keep the store's `savedAt`
 * ascending order rather than being re-sorted here, so saving a document does not
 * renumber the ones already in the block.
 *
 * An **included** document's head is injected and *not* also searched: it is
 * already in the block verbatim, so a match would print it twice.
 */
export function documentHits(options: {
  uploads: readonly Upload[];
  library: readonly LibraryDocument[];
  query: string;
}): RetrievedChunk[] {
  const { uploads, library, query } = options;

  const injected: RetrievedChunk[] = library
    .filter((doc) => doc.include)
    .map((doc) => ({ chunk: doc.document, score: 0 }));

  return [...uploadHits(uploads, query), ...injected, ...searchChunks(libraryPool(library), query)];
}
