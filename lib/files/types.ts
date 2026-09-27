/**
 * Upload state — docs/03_UI_UX_SPEC.md §6, docs/02_TECH_SPEC.md §8.7
 */

import type { AppError } from "@/lib/llm/errors";
import type { Chunk } from "@/lib/rag/chunk";

/**
 * Where a single attachment is in its lifecycle.
 *
 * `parsing` is a real state, not a spinner for its own sake: a 10 MiB PDF takes
 * long enough that a chip appearing only when it finished would look like the
 * click did nothing.
 *
 * `failed` carries the whole `AppError` rather than a bare string so the message
 * comes from `lib/llm/errors.ts` like every other user-facing failure — the chip
 * renders it, but does not word it.
 */
export type UploadStatus =
  | { kind: "parsing" }
  | {
      kind: "ready";
      /**
       * The normalised full text, as `parseUpload` extracted it (`normalizeText`).
       *
       * **Not reconstructible from `document` + `tail`, which is why it is
       * carried.** `document.text` leads with the filename and may end with the
       * truncation note, and every tail chunk leads with its own `续 i/n` line;
       * but the real loss is `groupParagraphs` (`lib/files/prepare.ts`), which
       * trims each paragraph and rejoins with exactly `\n\n` — so runs of three
       * or more newlines and per-paragraph leading whitespace are gone from the
       * tail and cannot be stripped back in. When `truncated` is false there is
       * no tail at all, so the overflow does not even exist to reconstruct from.
       *
       * What needs it is the 资料夹 (`lib/files/library.ts`): saving a document
       * re-runs `prepareText` at the folder's smaller budget, and that has to
       * start from the source text rather than from a split derived at a
       * different budget. Carrying it here is the only point where the text is
       * still whole — the raw `File` is dropped by every parser.
       */
      text: string;
      /** Non-whitespace characters of parsed text (`countChars`). */
      chars: number;
      /**
       * How many of those characters reached the prompt. Equals `chars` unless
       * truncated; the chip reports both, and neither is derived in the view.
       */
      inlineChars: number;
      /** True when the text exceeded `INLINE_BUDGET_CHARS` and has a tail. */
      truncated: boolean;
      /** Injected into the prompt verbatim, with the truncation note appended. */
      document: Chunk;
      /** The overflow, for the session's retrieval pool. Empty when not truncated. */
      tail: Chunk[];
    }
  | { kind: "failed"; error: AppError };

export interface Upload {
  /**
   * Session-unique. The React key and the chunk-id prefix.
   *
   * Distinct from `name` because two files may share a filename — attaching
   * `纪要.pdf` twice must not collide in the retrieval index, and removing one
   * must not take the other with it.
   */
  key: string;
  /** Display name and the prompt's attribution (§8.7). */
  name: string;
  /** Bytes on disk. Used only for the refusal copy. */
  size: number;
  status: UploadStatus;
}

/**
 * True when at least one attachment has finished parsing and can be sent —
 * `03_UI_UX_SPEC.md` §6: a ready attachment alone enables Send.
 *
 * **All three states are distinguished, and that is the point.** A chip still
 * `parsing` has nothing sendable yet; a `failed` one has nothing to send at all.
 * Send enabling itself for either would be a lie, and the plausible wrong
 * spelling is exactly one word away — `kind !== "failed"` reads like "the file is
 * done failing" and would enable Send over a file that is still being read.
 *
 * A named function rather than an inline `.some()` in `ChatInput` so this
 * discrimination is checkable without a browser (`scripts/verify-upload.mts`).
 */
export function hasSendable(uploads: readonly Upload[]): boolean {
  return uploads.some((upload) => upload.status.kind === "ready");
}
