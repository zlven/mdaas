"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * The chat input — docs/03_UI_UX_SPEC.md §6.
 *
 * Three behaviours in here are requirements rather than polish:
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
 */

/** Roughly six lines of `--text-body`, per §6. Past this the textarea scrolls. */
const MAX_HEIGHT = 200;

const READY_PLACEHOLDER = "想让这位专家做什么？";
const NO_KEY_PLACEHOLDER = "先到设置里填一个模型服务商的 API Key";

export function ChatInput({
  ready,
  streaming,
  onSend,
  onStop,
}: {
  /** False when no provider is configured. The input is shown, not hidden. */
  ready: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [coarse, setCoarse] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

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

  function submit() {
    const text = value.trim();
    if (text === "" || !ready || streaming) return;
    onSend(text);
    setValue("");
  }

  const canSend = ready && !streaming && value.trim() !== "";

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

      {/* Attachment and workflow controls belong here, inside the container
          (§6). Both are deferred — see the note in Workspace. */}
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="text-micro text-ink-subtle">
          {ready ? null : (
            <>
              Key 存在你自己的浏览器里。 <Link href="/settings/" className="text-ink-muted underline underline-offset-2">去设置</Link>
            </>
          )}
        </p>

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
