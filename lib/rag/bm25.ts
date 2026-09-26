/**
 * BM25 over an agent's knowledge chunks — docs/02_TECH_SPEC.md §8.3
 *
 * Field-weighted rather than field-separated: the three fields are folded into
 * one weighted term frequency per chunk, so there is a single scoring pass and a
 * single document length. `title` counts three times, `tags` twice, the body
 * once. Document length is the weighted sum, which is what makes the `b`
 * normalisation mean the same thing across chunks.
 *
 * Pure functions over an in-memory index. Nothing here fetches, caches, or knows
 * what an agent is — that is `retriever.ts`.
 */

import type { Chunk } from "@/lib/rag/chunk";
import { tokenize } from "@/lib/rag/tokenize";

/** Standard BM25 saturation and length-normalisation constants (§8.3). */
export const K1 = 1.5;
export const B = 0.75;

export const FIELD_WEIGHTS = { title: 3, tags: 2, body: 1 } as const;

export const DEFAULT_TOP_K = 5;

/**
 * The score floor, as a fraction of the best score in the result set (§8.3).
 *
 * A fraction rather than an absolute threshold because BM25 scores are unbounded
 * and depend on the query: 3.0 is a strong match for a one-word query and a weak
 * one for a ten-word query. This value drops the tail — chunks that matched one
 * incidental term while the top hit matched several.
 */
export const SCORE_FLOOR_RATIO = 0.35;

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
}

interface Posting {
  doc: number;
  tf: number;
}

export interface Bm25Index {
  chunks: Chunk[];
  /** Weighted document length, in the same units as `avgLength`. */
  lengths: Float64Array;
  avgLength: number;
  postings: Map<string, Posting[]>;
}

function addTerms(into: Map<string, number>, tokens: string[], weight: number): void {
  for (const token of tokens) into.set(token, (into.get(token) ?? 0) + weight);
}

/**
 * Builds the index once per session (§8.5).
 *
 * The `body` field is the chunk's full text, which begins with the
 * `title — heading` prefix written by the chunker. Title terms therefore arrive
 * through both the `title` field and the body prefix and end up weighted a little
 * above 3. That is left as is: a title match is a strong relevance signal, and
 * the alternative — slicing the prefix back off by string surgery — would break
 * silently the first time the prefix format changed.
 */
export function buildIndex(chunks: Chunk[]): Bm25Index {
  const postings = new Map<string, Posting[]>();
  const lengths = new Float64Array(chunks.length);

  chunks.forEach((chunk, doc) => {
    const tf = new Map<string, number>();
    addTerms(tf, tokenize(chunk.title), FIELD_WEIGHTS.title);
    addTerms(tf, tokenize(chunk.tags.join(" ")), FIELD_WEIGHTS.tags);
    addTerms(tf, tokenize(chunk.text), FIELD_WEIGHTS.body);

    let length = 0;
    for (const [term, weight] of tf) {
      length += weight;
      const list = postings.get(term);
      if (list) list.push({ doc, tf: weight });
      else postings.set(term, [{ doc, tf: weight }]);
    }
    lengths[doc] = length;
  });

  let total = 0;
  for (let i = 0; i < lengths.length; i++) total += lengths[i] ?? 0;

  return {
    chunks,
    lengths,
    avgLength: chunks.length > 0 ? total / chunks.length : 0,
    postings,
  };
}

/**
 * Scores and returns the top `k` chunks that clear the floor.
 *
 * Returns nothing when nothing clears it, and nothing when the query has no
 * token in the corpus at all — §8.3 and §8.8 both depend on the empty result
 * being reachable, so there is no "best effort" fallback that returns the top
 * scorers regardless.
 */
export function search(index: Bm25Index, query: string, k: number = DEFAULT_TOP_K): RetrievedChunk[] {
  const terms = tokenize(query);
  const n = index.chunks.length;
  if (terms.length === 0 || n === 0 || index.avgLength === 0) return [];

  const scores = new Float64Array(n);

  // Repeated query terms are summed rather than deduplicated: a query is often a
  // whole user message, and a term the user stressed is a real signal.
  for (const term of terms) {
    const list = index.postings.get(term);
    if (!list) continue;

    const df = list.length;
    // The `+1` form of IDF, which stays positive for a term in every document —
    // the textbook formula goes negative there and would rank a chunk *down* for
    // matching.
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));

    for (const posting of list) {
      const length = index.lengths[posting.doc] ?? 0;
      const norm = 1 - B + (B * length) / index.avgLength;
      scores[posting.doc] = (scores[posting.doc] ?? 0) + (idf * (posting.tf * (K1 + 1))) / (posting.tf + K1 * norm);
    }
  }

  const scored: RetrievedChunk[] = [];
  for (let doc = 0; doc < n; doc++) {
    const score = scores[doc] ?? 0;
    const chunk = index.chunks[doc];
    if (score > 0 && chunk) scored.push({ chunk, score });
  }
  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);

  const floor = (scored[0]?.score ?? 0) * SCORE_FLOOR_RATIO;
  return scored.filter((hit) => hit.score >= floor).slice(0, k);
}
