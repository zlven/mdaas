"use client";

import { formatChars } from "@/components/ui/format";
import type { Upload } from "@/lib/files/types";

/**
 * The attached files, as a row of chips above the textarea —
 * docs/03_UI_UX_SPEC.md §6 (Attachments), docs/01_PRD.md §6.
 *
 * Four things here are requirements rather than styling:
 *
 *   - **A refusal belongs to one file.** It is rendered on that file's chip, not
 *     in a dialog and not in the conversation's error card, because two files in
 *     one turn can fail for two different reasons and neither is a failed answer.
 *     `--danger` appears in this component for that state and nowhere else: every
 *     chip colour here is a genuine per-file status.
 *   - **A failed chip keeps its remove control.** The reason stays readable until
 *     the user clears it. A chip that cannot be dismissed is a dead end; one that
 *     dismisses itself takes the explanation with it.
 *   - **The remove control is a real `<button>` with a Chinese `aria-label` naming
 *     the file** (§11, J4). A bare ✕ is announced as "times", which tells a
 *     screen-reader user nothing about what it removes.
 *   - **Nothing is computed from something else.** The character counts come from
 *     the upload's own status, not from re-measuring the chunk text, which also
 *     contains the filename and the truncation note — see `PreparedText`.
 *
 * The list is a `<ul>` because it is a list of things. §6 says so, and it is what
 * makes a screen reader announce three items instead of three stray strings.
 *
 * `onSave` is the 资料夹's entry point: a saved document is an attachment with a
 * longer life, so the control that moves one into the folder belongs on the chip
 * rather than in a menu somewhere else. See the note at the button.
 */

export function AttachmentChips({
  uploads,
  onRemove,
  onSave,
}: {
  uploads: Upload[];
  onRemove: (key: string) => void;
  /**
   * Saves one parsed attachment to the 资料夹, or `null` when the folder cannot
   * be written to at all — in which case the control is not offered rather than
   * offered and refused. A nullable handler instead of a separate boolean so the
   * two cannot disagree about which one the button reads.
   *
   * A full folder is **not** one of those cases. The store owns the cap and words
   * the refusal (`lib/llm/errors.ts`), and this component has no way to know
   * whether a slot has since been freed — so the click is allowed and the answer
   * is reported where the click happened.
   */
  onSave: ((upload: Upload) => void) | null;
}) {
  if (uploads.length === 0) return null;

  return (
    <ul aria-label="已附加的文件" className="mb-2 flex flex-wrap gap-2">
      {uploads.map((upload) => (
        <li
          key={upload.key}
          className="flex max-w-full items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-surface-alt py-1 pl-2 pr-1 text-micro"
        >
          <span aria-hidden="true">📄</span>

          {upload.status.kind === "failed" ? (
            /* The message already opens with the filename — every factory in
               `lib/llm/errors.ts` is written that way, so the file is named once
               rather than twice. It is also the one chip whose text is prose
               rather than a fixed label, so it wraps instead of being clipped:
               a refusal you cannot finish reading is not a refusal you can act
               on. */
            <span className="min-w-0 text-danger">{upload.status.error.message}</span>
          ) : (
            <>
              <span className="min-w-0 truncate" title={upload.name}>
                {upload.name}
              </span>
              <span aria-hidden="true" className="text-ink-subtle">
                ·
              </span>
              <span className="shrink-0 text-ink-subtle">
                {upload.status.kind === "parsing"
                  ? "读取中…"
                  : upload.status.truncated
                    ? /* The file's total, with what actually reached the prompt
                         beside it. Showing only the injected portion would make
                         a truncated file indistinguishable from a short one. */
                      `${formatChars(upload.status.chars)} 字符（前 ${formatChars(upload.status.inlineChars)} 已读入，其余可检索）`
                    : `${formatChars(upload.status.chars)} 字符`}
              </span>
            </>
          )}

          {/* Only for a `ready` file, and only when the folder can be written
              to. A `parsing` one has no text to save yet, and a `failed` one has
              no text at all — offering the control there would be offering to
              save nothing.

              **`type="button"` is load-bearing here and not merely tidy.** These
              chips are rendered inside `ChatInput`'s `<form>`, where a button
              with no `type` defaults to `submit` — clicking 存到资料夹 would send
              the message. */}
          {upload.status.kind === "ready" && onSave !== null ? (
            <button
              type="button"
              onClick={() => onSave(upload)}
              className="shrink-0 rounded-[var(--radius-sm)] px-1 text-ink-subtle underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
            >
              存到资料夹
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onRemove(upload.key)}
            aria-label={`移除 ${upload.name}`}
            className="shrink-0 rounded-[var(--radius-sm)] px-1 text-ink-subtle transition-colors duration-150 ease-out hover:text-ink"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
