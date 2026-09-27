/**
 * Attachments as reference material — docs/02_TECH_SPEC.md §8.7
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
 *   3. **The upload pool is searched separately from the knowledge base.** A
 *      shared index would normalise the two score distributions against each
 *      other, and a long knowledge corpus would push every upload hit below
 *      `SCORE_FLOOR_RATIO`. The two pools are concatenated by the caller, in the
 *      order the prompt numbers them.
 *
 * Nothing here is gated on the agent having a knowledge base: five of the nine
 * agents have none, and every one of them can read a file the user hands it.
 */

import type { Upload } from "@/lib/files/types";
import { buildIndex, search, type RetrievedChunk } from "@/lib/rag/bm25";

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
  // Synchronous, and over the session's own attachments — no fetch, no failure
  // mode. An empty pool means an empty search, not an error.
  const overflow = tails.length > 0 ? search(buildIndex(tails), query) : [];

  return [...injected, ...overflow];
}
