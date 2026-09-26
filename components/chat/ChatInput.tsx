"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AttachmentChips } from "@/components/chat/AttachmentChips";
import { Button } from "@/components/ui/Button";
import { ACCEPTED_EXTENSIONS, ACCEPTED_LABEL } from "@/lib/files/limits";
import { hasSendable, type Upload } from "@/lib/files/types";

/**
 * The chat input — docs/03_UI_UX_SPEC.md §6.
 *
 * Four behaviours in here are requirements rather than polish:
 *
 *   - **The no-key state keeps the input visible.** §6: "Do not hide the input —
 *     hiding it makes the product look broken." The textarea stays, disabled,
 *     with the placeholder carrying the explanation and a link beside it.
 *   - **Enter sends, Shift+Enter newlines — except on a coarse pointer.** A
 *     phone's Enter key is the newline key; treating it as send makes anything
 *     longer than one line impossible to type. Read from `matchMedia` after
 *     mount, because there is no pointer during the static render.
 *   - **Composition is not submission.** A Chinese IME uses Enter to commit a
 *     candidate word. Without the `isComposing` guard, selecting a candidate
 *     sends a half-typed message.
 *   - **Attaching is not gated on having a key** (§6). Files are prepared now and
 *     become sendable the moment a key exists, which is why the attach control is
 *     never disabled — only Send is.
 *   - **A ready attachment alone enables Send** (§6). Handing over a document and
 *     asking nothing is a complete message, and a grey button after a successful
 *     parse reads as the product rejecting the file. The turn then says
 *     「（见附件）」 rather than nothing, because a user turn cannot be empty.
 *
 * The chips sit **above** the textarea (§6), inside the same bordered container,
 * so an attachment reads as part of the message being composed rather than as a
 * page-level panel.
 */

/** Roughly six lines of `--text-body`, per §6. Past this the textarea scrolls. */
const MAX_HEIGHT = 200;

const READY_PLACEHOLDER = "想让这位专家做什么？";
const NO_KEY_PLACEHOLDER = "先到设置里填一个模型服务商的 API Key";

/**
 * What the turn says when the user attached a file and typed nothing.
 * docs/03_UI_UX_SPEC.md §6 — see `outgoing` for why there has to be something.
 *
 * This string is also what `Workspace` hands the overflow search as the query,
 * because that is simply the message. So it can match: measured against a tail
 * that says 「请参见附件三的流程图」, 「（见附件）」 returns hits, and 「附件」 does
 * too. Left as it is, deliberately — every chunk it can surface belongs to the
 * file the user attached in that same turn, so the panel is not claiming the
 * material came from anywhere else, and the panel is titled 本次检索 rather than
 * 「匹配你问题的内容」. Filtering it out would mean threading "there was no
 * question" through `send`, coupling `Workspace` to a string of UI copy, to hide
 * content from the user's own attachment.
 */
const ATTACHMENT_ONLY = "（见附件）";

export function ChatInput({
  ready,
  streaming,
  uploads,
  onSend,
  onStop,
  onAttach,
  onRemoveUpload,
}: {
  /** False when no provider is configured. The input is shown, not hidden. */
  ready: boolean;
  streaming: boolean;
  uploads: Upload[];
  onSend: (text: string) => void;
  onStop: () => void;
  onAttach: (files: File[]) => void;
  onRemoveUpload: (key: string) => void;
}) {
  const [value, setValue] = useState("");
  const [coarse, setCoarse] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Grows with content, then scrolls. Runs on mount and after every change,
  // including the clear on send — which is why it is a state effect rather than
  // a call inside the submit handler.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const hasReadyUpload = hasSendable(uploads);

  /**
   * The message this submit would send, or `null` when there is nothing to send.
   *
   * One predicate, read by both the button's `disabled` and the form's submit —
   * including the Enter path, which routes through `submit`. Written as two
   * conditions in two places they drift, and the visible symptom is Enter sending
   * a turn the button would have refused.
   */
  function outgoing(): string | null {
    if (!ready || streaming) return null;
    const text = value.trim();
    if (text !== "") return text;
    // A ready file with an empty box is a complete message (03_UI_UX_SPEC.md §6).
    // The user turn cannot be empty: the bubble would render as a blank box and
    // the model would be asked to answer with no question in front of it. So the
    // turn carries this, and it is the only place in the product where a user
    // message contains words the user did not type.
    return hasReadyUpload ? ATTACHMENT_ONLY : null;
  }

  function submit() {
    const text = outgoing();
    if (text === null) return;
    onSend(text);
    setValue("");
  }

  const canSend = outgoing() !== null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="rounded-[var(--radius)] border border-line bg-surface p-3 transition-colors duration-150 ease-out focus-within:border-line-strong"
    >
      <label htmlFor="chat-input" className="sr-only">
        给这位专家发消息
      </label>

      <AttachmentChips uploads={uploads} onRemove={onRemoveUpload} />

      <textarea
        id="chat-input"
        ref={ref}
        rows={1}
        value={value}
        disabled={!ready}
        placeholder={ready ? READY_PLACEHOLDER : NO_KEY_PLACEHOLDER}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          // `nativeEvent` — React's synthetic event has no `isComposing`.
          if (event.nativeEvent.isComposing) return;
          if (event.shiftKey) return;
          if (coarse) return;
          event.preventDefault();
          submit();
        }}
        className="w-full resize-none bg-transparent text-body text-ink placeholder:text-ink-subtle disabled:cursor-not-allowed"
      />

      {/* The control row (§6). The workflow control that belongs beside the
          attach control is still to come — see the note in Workspace. */}
      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* A button plus a visually hidden input: the button is the focus
              target, so the input must not be one (§11, J4). `sr-only` rather
              than `hidden`, because `display: none` makes the input unclickable
              in some browsers — but `sr-only` clips rather than removes, so the
              input stays in the tab order and would be an invisible focus stop
              without the `tabIndex`. */}
          <input
            ref={fileRef}
            type="file"
            multiple
            tabIndex={-1}
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              // Cleared so re-selecting the same file fires `change` again —
              // otherwise removing a chip and re-attaching that file does
              // nothing at all.
              event.target.value = "";
              if (files.length > 0) onAttach(files);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex shrink-0 items-center gap-1 text-micro text-ink-muted transition-colors duration-150 ease-out hover:text-ink"
          >
            <span aria-hidden="true">📎</span>
            附件
            <span className="sr-only">（{ACCEPTED_LABEL}）</span>
          </button>

          {/* Wraps rather than truncates: on a phone this row is narrow enough
              that `truncate` would clip the privacy claim mid-sentence, and a
              half-stated privacy claim is worse than a taller row. */}
          <p className="min-w-0 text-micro text-ink-subtle">
            {ready ? (
              // `01_PRD.md` §6 requires this line: parsing happens in the
              // browser and the file is never uploaded. It is a real privacy
              // property and the only place the user is told about it.
              <>文件只在你的浏览器里解析，不会上传。</>
            ) : (
              <>
                Key 存在你自己的浏览器里。{" "}
                <Link href="/settings/" className="text-ink-muted underline underline-offset-2">
                  去设置
                </Link>
              </>
            )}
          </p>
        </div>

        {streaming ? (
          <Button type="button" variant="secondary" size="sm" onClick={onStop}>
            停止
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={!canSend}>
            发送
            <span aria-hidden="true">→</span>
          </Button>
        )}
      </div>
    </form>
  );
}
