/**
 * Turning a parsed attachment into a **资料夹 document** — docs/02_TECH_SPEC.md §8.7
 *
 * A plain session attachment and a saved document are the same object with
 * different lifetimes: both are a head chunk injected verbatim plus a tail
 * searched on demand. The only differences are the budget
 * (`LIBRARY_INLINE_BUDGET_CHARS`, a third of `INLINE_BUDGET_CHARS`) and where
 * the text comes from. So this module is thin on purpose — it calls the same
 * `prepareText` every upload already goes through, and the whole retrieval and
 * injection path downstream stays unchanged.
 *
 * **That is the design, not a shortcut.** The prompt-injection boundary is drawn
 * in `lib/rag/context.ts`: reference material is one delimited block, and
 * `neutralize` escapes the delimiters in the text *and* in the user-supplied
 * filename. A saved document reuses both halves of that untouched, so this
 * feature adds no new prompt clause, no new marker pair, and no new surface that
 * a knowledge file or an attachment does not already have.
 *
 * Pure. No DOM, no store import, no React — so the budget arithmetic is
 * verifiable from Node (`scripts/verify-upload.mts`).
 */

import { LIBRARY_INLINE_BUDGET_CHARS } from "@/lib/files/limits";
import { prepareText } from "@/lib/files/prepare";
import type { Upload } from "@/lib/files/types";
import type { Chunk } from "@/lib/rag/chunk";

/**
 * A document as the 资料夹 stores it, and as `lib/store/library.ts` persists it.
 *
 * **The derived split is stored, not the source text.** Re-deriving on every
 * read would mean re-running `splitForInjection` and `groupParagraphs` over a
 * document-sized string each time the list is read — and it is read once per
 * message and once per workflow step. The cost of storing the split is that
 * changing the budget would invalidate saved records; `02_TECH_SPEC.md` §9
 * already answers that for every store in this repo ("on mismatch, discard
 * rather than attempt migration"), and a bump is the honest way to spend it.
 *
 * Both representations are deliberately *not* kept. Two forms of the same text
 * can disagree, and then which one the prompt received depends on which field a
 * caller happened to read.
 */
export interface LibraryDocument {
  /**
   * Store-assigned, never derived from the filename — two documents really can
   * be called `纪要.pdf`, and the id is also the chunk-id prefix, where a
   * collision would merge two documents in the retrieval index.
   */
  readonly id: string;
  /** Display name and the prompt's attribution line (§8.7). */
  readonly name: string;
  /** Epoch ms. Used for the stable injection order and shown in the panel. */
  readonly savedAt: number;
  /**
   * Whether this document rides on every message.
   *
   * Off does **not** mean unreachable: an excluded document still contributes
   * its head and tail to the retrieval pool (`lib/rag/uploads.ts`), so it can
   * still be retrieved on demand. The toggle trades presence for cost, not
   * availability for unavailability — and the panel has to say so, because
   * "turned off" reading as "gone" would be a worse lie than a large bill.
   */
  readonly include: boolean;
  /** Non-whitespace characters of the whole document (`countChars`). */
  readonly chars: number;
  /** Of those, how many are inlined. `<= LIBRARY_INLINE_BUDGET_CHARS`. */
  readonly inlineChars: number;
  /** True when the document exceeded the budget and has a tail. */
  readonly truncated: boolean;
  /** Injected verbatim when `include`. */
  readonly document: Chunk;
  /** The overflow, for the retrieval pool. Empty when not truncated. */
  readonly tail: Chunk[];
}

/**
 * The chunk-id prefix for one document. Both a namespace (`ul:` is the session
 * uploads) and the reason the prefix is derived from the id rather than the name.
 */
export function libraryChunkPrefix(id: string): string {
  return `lib:${id}`;
}

/**
 * Builds one folder document from a parsed attachment, or `null` when there is
 * nothing to save.
 *
 * `null` for a `parsing` upload and for a `failed` one. The caller renders the
 * save control off `status.kind === "ready"`, so a non-null result here and a
 * visible control are the same condition — and the guard is what makes that true
 * rather than a coincidence two files have to keep agreeing on (06_ACCEPTANCE.md
 * E9: a file that yielded no text offers nothing to store).
 *
 * `text` is read from the ready status rather than reconstructed from
 * `document` + `tail`. That reconstruction is **lossy and silently so** — see the
 * field's comment in `lib/files/types.ts` — and it would fail hardest on exactly
 * the documents worth saving, the long ones.
 */
export function libraryDocumentFrom(options: {
  upload: Upload;
  agentId: string;
  id: string;
  savedAt: number;
}): LibraryDocument | null {
  const { upload, agentId, id, savedAt } = options;
  const status = upload.status;
  if (status.kind !== "ready") return null;

  const prepared = prepareText({
    text: status.text,
    fileName: upload.name,
    agentId,
    idPrefix: libraryChunkPrefix(id),
    budget: LIBRARY_INLINE_BUDGET_CHARS,
  });

  // **Provenance goes in `heading` because `heading` is not indexed.**
  // `buildIndex` (`lib/rag/bm25.ts`) weights `title`, `tags` and `text` only, so
  // this cannot move a score — which matters, because the heading is stamped
  // onto the head *and* every tail chunk and a scoring change would be invisible.
  // `RetrievalPanel` renders `heading` as the row label, so this is also what
  // tells the user a hit came from their folder rather than from the knowledge
  // base. The filename stays in `source`, which is the prompt's citation line.
  const stamp = (chunk: Chunk, suffix?: string): Chunk => ({
    ...chunk,
    heading: suffix ? `资料夹 · 续 ${suffix}` : `资料夹 · ${upload.name}`,
  });

  return {
    id,
    name: upload.name,
    savedAt,
    // Default on: the folder exists so the expert remembers, and a document that
    // is stored but never inlined does not do that. The user unchecks what costs
    // more than it is worth to them.
    include: true,
    chars: prepared.chars,
    inlineChars: prepared.inlineChars,
    truncated: prepared.truncated,
    document: stamp(prepared.document),
    tail: prepared.tail.map((chunk) => stamp(chunk, chunk.heading.replace(/^续 /, ""))),
  };
}

/**
 * How many non-whitespace characters this folder adds to every message — the
 * panel's cost line, and the only number a user can act on.
 *
 * A pure function over the stored list rather than a value the store keeps
 * alongside it: a cached total is one more thing that can disagree with the
 * documents it summarises, and recomputing five integers is free. It sums
 * `inlineChars`, which is what `prepareText` measured on the text actually
 * injected — not the budget, which the cut may land well below.
 */
export function libraryInlineChars(documents: readonly LibraryDocument[]): number {
  return documents.reduce((total, doc) => total + (doc.include ? doc.inlineChars : 0), 0);
}

/** How many documents are currently inlined. The other half of the cost line. */
export function includedCount(documents: readonly LibraryDocument[]): number {
  return documents.reduce((total, doc) => total + (doc.include ? 1 : 0), 0);
}
