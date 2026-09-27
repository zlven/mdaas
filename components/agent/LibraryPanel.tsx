"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { formatChars } from "@/components/ui/format";
import { Notice } from "@/components/ui/Notice";
import { RailSection } from "@/components/ui/RailSection";
import type { AgentConfig } from "@/lib/agents/types";
import { includedCount, libraryInlineChars, type LibraryDocument } from "@/lib/files/library";
import { ACCEPTED_EXTENSIONS, ACCEPTED_LABEL, canAddDocument, MAX_LIBRARY_DOCUMENTS } from "@/lib/files/limits";
import { libraryFullError } from "@/lib/llm/errors";
import {
  librarySnapshot,
  removeLibraryDocument,
  retryLibrarySave,
  serverLibrarySnapshot,
  setDocumentIncluded,
  subscribeLibrary,
} from "@/lib/store/library";

/**
 * 资料夹 — the documents this expert keeps for you — docs/02_TECH_SPEC.md §8.7
 *
 * A saved document is an attachment that outlives the session, so this panel is
 * deliberately shaped like `AttachmentChips` rather than like a file manager:
 * the same name, the same character count in the same words, and no folders,
 * no renaming and no folders-within-folders. There are five slots. That is the
 * whole feature.
 *
 * Four things here are requirements rather than styling:
 *
 *   - **The toggle is a real `<input type="checkbox">`.** It is a state the user
 *     owns, and the native control brings the checked-state announcement, the
 *     Space key, and the correct role to a screen reader for free — the same
 *     reason `Disclosure` is built on `<details>`. A `role="switch"` button
 *     would have to re-implement all three.
 *   - **The cost line is computed from the same numbers that are injected.** It
 *     sums `inlineChars` over the included documents through the store's own
 *     selectors, so the sentence cannot claim one thing while `documentHits`
 *     sends another. It is exact rather than approximate (no 约) for the same
 *     reason: the user is paying for it with their own key.
 *   - **Deleting is two-step.** One click that destroys the only copy of a
 *     document the user saved on purpose is not a control that should exist. It
 *     mirrors 清空档案 rather than 清空对话 — the latter is one click today, which
 *     `06_ACCEPTANCE.md` D8 says it should not be.
 *   - **Nothing promises durability.** See the footer: the folder survives reloads
 *     and restarts, and it is still browser storage that can be evicted. 永久保存
 *     and 不会丢失 are claims this product cannot make.
 *
 * **It renders in two places, and that is deliberate** — exactly as
 * `ProfilePanel` does, for exactly the same reason: below `lg` the rail is gone,
 * so `Workspace` repeats this as a collapsed strip rather than making the folder
 * unreachable on a phone. `idPrefix` is therefore required, and the two call
 * sites pass different values: both copies are in the DOM at once and `document`
 * resolves a duplicate `id` to the first match, which is the hidden one. Get it
 * wrong and clicking the label silently flips nothing.
 */

export type LibraryVariant = "rail" | "strip";

export function LibraryPanel({
  agent,
  variant = "rail",
  idPrefix,
  onAddFiles,
}: {
  agent: AgentConfig;
  variant?: LibraryVariant;
  /** Required: two instances of this panel are in the DOM at once. See the header. */
  idPrefix: string;
  /**
   * Hands files to `Workspace`'s one parse loop. Supplied by the caller rather
   * than parsed here, so a document added from this panel goes through the same
   * sequential `prepareUpload` and reports a parse failure the same way an
   * attachment does — on a chip, which is where `AttachmentChips` says a
   * per-file refusal belongs.
   */
  onAddFiles: (files: File[]) => void;
}) {
  const agentId = agent.id;

  const subscribe = useCallback((listener: () => void) => subscribeLibrary(agentId, listener), [agentId]);
  const getSnapshot = useCallback(() => librarySnapshot(agentId), [agentId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverLibrarySnapshot);

  /** One document at a time: the id whose 确认删除 row is open. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const body = (): ReactNode => {
    // Its own branch, and the same reason `ProfilePanel` has one: falling through
    // to the list here would flash 「还没有保存的资料」 at a user who has five.
    if (snapshot.status === "loading") {
      return <p className="text-small text-ink-muted">正在读取这个浏览器里保存的资料…</p>;
    }

    const documents = snapshot.documents;
    // The store opened but could not be read: documents may exist that we have
    // never seen, so the list is shown and nothing may change it.
    const unreadable = snapshot.status === "session-only" && !snapshot.editable;
    const editable = !unreadable;

    const room = canAddDocument(documents);
    const fullReason = room.ok ? null : libraryFullError(room.limit).message;

    const included = includedCount(documents);
    const inlineChars = libraryInlineChars(documents);

    return (
      <div className="space-y-3">
        {snapshot.status === "session-only" ? <Notice error={snapshot.error} /> : null}

        {snapshot.status === "ready" && snapshot.saveError !== null ? (
          <Notice
            error={snapshot.saveError}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => retryLibrarySave(agentId)}>
                重试
              </Button>
            }
          />
        ) : null}

        {documents.length === 0 ? (
          <p className="text-small text-ink-muted">
            还没有保存的资料。附上文件后点「存到资料夹」，以后打开这个专家它都还在。
          </p>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                agentId={agentId}
                idPrefix={idPrefix}
                editable={editable}
                confirming={confirmingId === doc.id}
                onAskDelete={() => setConfirmingId(doc.id)}
                onCancelDelete={() => setConfirmingId(null)}
              />
            ))}
          </ul>
        )}

        {/* The count is the heading's; this is the cost, which is the part the
            user is actually deciding about. Both sentences are unconditional
            statements about what this build does, and neither hedges. */}
        {documents.length > 0 ? (
          <p className="text-micro text-ink-subtle">
            {included === 0
              ? "这些文档都会保存，但不会每次都带上；需要时仍会被检索到。"
              : `每次发消息会带上 ${included} 篇，共 ${formatChars(inlineChars)} 字（按你自己的 Key 计费）。`}
          </p>
        ) : null}

        {/* Shown only when the folder can be written to. While it cannot, the
            notice above is the whole story, and an add control that is certain
            to be refused is a dead end rather than an affordance.

            The cap is different and is therefore *not* pre-empted into hiding:
            reaching five is the expected end of this feature, so the control
            stays visible and disabled, and says why in the line below it. A
            control that silently disappears at the ceiling reads as a bug. */}
        {editable ? (
          <div className="border-t border-line pt-3">
            {/* The button plus a visually hidden input, with `tabIndex={-1}` on
                the input: the button is the focus target and the input must not
                be a second one (`ChatInput`'s 附件 is the same control, and these
                four details are the whole of it). `sr-only` rather than `hidden`
                because `display: none` makes the input unclickable in some
                browsers, and `accept` is the same list the parser can actually
                read — a picker that offers a format we then refuse is worse than
                a picker that does not offer it. */}
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
                // otherwise saving a document, deleting it, and adding it back
                // does nothing at all.
                event.target.value = "";
                if (files.length > 0) onAddFiles(files);
              }}
            />
            <button
              type="button"
              disabled={fullReason !== null}
              title={fullReason ?? undefined}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-micro text-ink-muted transition-colors duration-150 ease-out hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">📎</span>
              添加文档
              <span className="sr-only">（{ACCEPTED_LABEL}）</span>
            </button>
            {fullReason === null ? null : (
              // Both a `title` and this line. The title is the `WorkflowControls`
              // idiom for a disabled control; the line is because a hard product
              // cap is not a transient busy state — the user has to go and delete
              // something before this button will ever work again, and a hover
              // tooltip is not reachable on a phone.
              <p className="mt-1 text-micro text-ink-subtle">{fullReason}</p>
            )}
          </div>
        ) : null}

        {editable ? (
          // The honest statement, and it does not depend on `persist()` having
          // been granted — the store asks for that, and its answer is deliberately
          // not shown (see `lib/store/library.ts`). 永久保存 and 已备份 are claims
          // this product must never make: the folder survives 清空对话, reloads
          // and restarts, until the browser evicts it or the user clears site data.
          // `--text-small` and not Body, for the reason spelled out at the same
          // line in `ProfilePanel`: fine print about the store, not the content
          // of the section.
          <p className="border-t border-line pt-3 text-small text-ink-subtle">
            资料夹保存在这个浏览器里，不跨设备同步。清除站点数据、使用无痕模式，或浏览器存储空间不足时，保存的文档可能丢失。
          </p>
        ) : null}
      </div>
    );
  };

  const summary = (): string => {
    if (snapshot.status === "loading") return "读取中";
    if (snapshot.status === "session-only" && !snapshot.editable) return "读取失败";
    return `已存 ${snapshot.documents.length} / ${MAX_LIBRARY_DOCUMENTS} 篇`;
  };

  const heading = `资料夹 · ${summary()}`;

  if (variant === "strip") {
    return <Disclosure summary={heading}>{body()}</Disclosure>;
  }

  // The rail's idiom, declared once in `RailSection` — and *not* a `<details>`:
  // the rail is permanently open, and one accordion among six plain sections
  // reads as a different kind of thing. (The strip variant above is the
  // exception: there the panel is one row in the composer's layout and owes that
  // layout its own disclosure shape.)
  return (
    <RailSection title="资料夹" note={summary()}>
      {body()}
    </RailSection>
  );
}

/**
 * One saved document: its name, its size, its toggle, and its delete.
 *
 * The name is `<span title>` + `truncate`, the treatment the attachment chip
 * uses. A filename is the one string here the user supplied, so it is the one
 * string that can be any length.
 */
function DocumentRow({
  doc,
  agentId,
  idPrefix,
  editable,
  confirming,
  onAskDelete,
  onCancelDelete,
}: {
  doc: LibraryDocument;
  agentId: string;
  idPrefix: string;
  editable: boolean;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
}) {
  // The document id, not its name: two files called 纪要.pdf are a real case, and
  // an id built from a name would collide in the DOM exactly as it would in the
  // retrieval index.
  const toggleId = `${idPrefix}-lib-${doc.id}`;

  return (
    <li className="text-small">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-ink" title={doc.name}>
          {doc.name}
        </span>

        {editable && !confirming ? (
          <button
            type="button"
            onClick={onAskDelete}
            aria-label={`删除 ${doc.name}`}
            className="shrink-0 rounded-[var(--radius-sm)] px-1 text-ink-subtle transition-colors duration-150 ease-out hover:text-ink"
          >
            <span aria-hidden="true">✕</span>
          </button>
        ) : null}
      </div>

      {/* The attachment chip's sentence, character for character. A truncated
          document reports its whole length with what is actually read in beside
          it; showing only the injected part would make a 31,000-character file
          indistinguishable from an 8,000-character one. */}
      <p className="text-micro text-ink-subtle">
        {doc.truncated
          ? `${formatChars(doc.chars)} 字符（前 ${formatChars(doc.inlineChars)} 已读入，其余可检索）`
          : `${formatChars(doc.chars)} 字符`}
      </p>

      <label htmlFor={toggleId} className="mt-1 flex items-center gap-2 text-micro text-ink-muted">
        <input
          id={toggleId}
          type="checkbox"
          checked={doc.include}
          disabled={!editable}
          onChange={(event) => setDocumentIncluded(agentId, doc.id, event.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        <span>
          每次都带上
          {/* The document's name, for a screen reader only. Five checkboxes in a
              row all labelled 「每次都带上」 are five labels that identify nothing
              — and this is the control that decides what the user pays for. */}
          <span className="sr-only">：{doc.name}</span>
        </span>
      </label>

      {confirming ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-micro text-ink-muted">删除后这份资料就没了，要用得重新存一次。</p>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              removeLibraryDocument(agentId, doc.id);
              onCancelDelete();
            }}
          >
            确认删除
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancelDelete}>
            取消
          </Button>
        </div>
      ) : null}
    </li>
  );
}
