/**
 * Upload limits and format detection — docs/01_PRD.md §6, docs/02_TECH_SPEC.md §8.7
 *
 * Pure. No DOM, no parser import, no `File` — so every rule in here is
 * exercisable from Node, which is where the refusal paths get verified.
 */

export type FileFormat = "pdf" | "docx" | "text";

/** 10 MiB, per `01_PRD.md` §6. Checked against the declared size, never by reading. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Non-whitespace characters of parsed text injected into the prompt verbatim.
 * Everything past this is chunked into the session's retrieval pool (§8.7).
 *
 * **Per file, not a shared total.** A shared budget would have to be divided
 * across the attachments, which needs every file's parse to know its siblings'
 * lengths and re-run whenever one is removed — and any division wastes the
 * unused share of a short file sitting next to a long one. Per file is
 * stateless and predictable. The consequence — many large files making a very
 * long prompt — is already specified: it surfaces as `CONTEXT_TOO_LONG`, whose
 * remedy tells the user to drop an attachment.
 *
 * 24,000 non-whitespace characters is roughly 24k tokens of Chinese, comfortable
 * for a large-context model and small enough that a 10 MiB file is mostly pool.
 */
export const INLINE_BUDGET_CHARS = 24_000;

/**
 * The same budget for one 资料夹 document (`lib/store/library.ts`), deliberately
 * a third of `INLINE_BUDGET_CHARS`.
 *
 * **The two are different numbers because the two are paid differently.** A
 * session attachment is a per-turn decision: the user attached it for this
 * question, and it stops costing anything the moment the chip is removed. A
 * folder document is inlined on *every* message until the user goes back and
 * turns it off, so the same 24,000 would be a recurring charge they did not
 * re-choose. Five documents at the session budget is 120,000 characters on every
 * single turn; at this budget the worst case is 40,000.
 *
 * A document over this budget is not lost — the overflow goes into the folder's
 * retrieval pool exactly as an attachment's does (§8.7), so the head is present
 * and the rest is reachable. `truncated` and `inlineChars` carry the distinction
 * to the panel.
 */
export const LIBRARY_INLINE_BUDGET_CHARS = 8_000;

/**
 * How many documents one agent's 资料夹 holds.
 *
 * A cap rather than unlimited, and it is a **cost** control before it is a UI
 * one: every saved document is a standing per-message charge the user is opting
 * into once, so the ceiling has to be low enough to read at a glance and to
 * reason about in tokens. Five is also what the panel can render without
 * scrolling on a laptop, which keeps "what am I paying for" answerable without
 * opening anything.
 *
 * The refusal is a normal state, not an error — the add control stays visible
 * and explains itself (`lib/llm/errors.ts` `LIBRARY_FULL`).
 */
export const MAX_LIBRARY_DOCUMENTS = 5;

/**
 * Whether one more document may be saved — a pure predicate over the list, so
 * the rule is checkable from Node and the store stays free of the wording.
 *
 * Takes the list, not a count, so a caller cannot pass a number that disagrees
 * with the list it is about. The limit comes back in the result rather than
 * being read separately by the caller, because the message has to name it and a
 * second read is a second chance to name the wrong one.
 *
 * `unknown[]` rather than `LibraryDocument[]` on purpose: the element type lives
 * in `lib/files/library.ts`, which imports this file for the budget, and naming
 * it here would close a cycle to express something this function never looks at.
 * It reads `.length` and nothing else — which is also why the assertion that
 * guards it can be written with plain objects.
 */
export function canAddDocument(
  documents: readonly unknown[],
): { ok: true } | { ok: false; limit: number } {
  if (documents.length < MAX_LIBRARY_DOCUMENTS) return { ok: true };
  return { ok: false, limit: MAX_LIBRARY_DOCUMENTS };
}

/**
 * Below this many extracted characters, a PDF is treated as image-only (E9).
 *
 * Not zero: a scanned PDF sometimes yields a stray page number or a header, and
 * "3 characters" is not a document. Reporting a near-empty extraction as success
 * is the silent-return-nothing failure `01_PRD.md` §6 names explicitly.
 */
export const MIN_EXTRACTED_CHARS = 20;

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;

/** For the refusal copy, and for `accept=` on the file input. */
export const ACCEPTED_LABEL = ACCEPTED_EXTENSIONS.join(" / ");

/**
 * Extension → parser. Case-insensitive, and deliberately last-dot only:
 * `report.final.PDF` is a PDF, and there is no attempt to sniff content, because
 * a wrong guess here produces a parse error that blames the wrong thing.
 *
 * `null` means unsupported, which the caller turns into a refusal naming the file.
 */
export function detectFormat(fileName: string): FileFormat | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;

  switch (fileName.slice(dot).toLowerCase()) {
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".txt":
    case ".md":
      return "text";
    default:
      return null;
  }
}

/** Human-readable bytes, for the refusal copy. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * The size ceiling. Takes a number, not a `File`, so it cannot accidentally read
 * one — E10 requires the refusal to happen *before* the file is read, and the
 * cheapest way to guarantee that is for the check to have no access to it.
 */
export function checkSize(sizeBytes: number): { ok: true } | { ok: false; actual: string; limit: string } {
  if (sizeBytes <= MAX_FILE_BYTES) return { ok: true };
  return { ok: false, actual: formatBytes(sizeBytes), limit: formatBytes(MAX_FILE_BYTES) };
}
