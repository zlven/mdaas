"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { FIELD, LABEL } from "@/components/ui/field";
import { Notice } from "@/components/ui/Notice";
import { PROFILE_NOTES_KEY } from "@/lib/agents/profile";
import type { AgentConfig, ProfileField } from "@/lib/agents/types";
import {
  clearProfile,
  profileSnapshot,
  retryProfileSave,
  serverProfileSnapshot,
  setProfileField,
  setProfileNotes,
  subscribeProfile,
} from "@/lib/store/memory";

/**
 * The profile — docs/04_AGENT_SPEC.md §6, docs/03_UI_UX_SPEC.md §5
 *
 * The fields are the agent's to declare (`AgentConfig.profile`), the values are
 * the user's, and this component only joins them. Nothing here knows what a 身高
 * is, which is what makes adding a field a config edit rather than a code change
 * (acceptance C4). 补充说明 is the exception, and it is a constant rather than
 * free-form structure: the user writes its *value*, never its label — see the
 * note in `lib/rag/context.ts` for why that distinction is load-bearing.
 *
 * **It renders in two places, and that is deliberate.** `lg` and up puts it in
 * the right rail, where it belongs — it is standing facts about the user, like
 * 能力 and 知识库, not an operation like the tools. Below `lg` the rail is gone,
 * so `Workspace` renders a second copy as a collapsed strip in the centre
 * column; otherwise the profile would be unreachable on a phone and acceptance
 * I9 has no breakpoint exemption.
 *
 * Duplicating it is safe here and would not be for the tools, which is why
 * `idPrefix` exists:
 *
 *   - **No draft.** Every input is controlled straight from the store's
 *     snapshot, so both copies read the same source and cannot disagree. The
 *     tools hold `useState` drafts, so two copies would be two forms.
 *   - **Ids must not collide.** Both copies are in the DOM at once, one hidden
 *     by `display: none`, and `document` resolves a duplicate `id` to whichever
 *     comes first — which is the hidden one. Every `id`/`htmlFor` therefore
 *     carries the instance prefix, and the two call sites pass different ones.
 *     Get this wrong and clicking a label silently does nothing.
 *
 * Writes go through on every keystroke, with no save button and no local draft.
 * The store is optimistic, so the field updates on the same tick, and coalescing
 * keeps IndexedDB to one write per round trip. A draft would buy nothing and cost
 * the one thing that matters: there would be a state in which what is on screen
 * and what the agent will be told are different.
 */

export type ProfileVariant = "rail" | "strip";

function ProfileInput({
  field,
  value,
  disabled,
  idPrefix,
  onChange,
}: {
  field: ProfileField;
  value: string;
  disabled: boolean;
  idPrefix: string;
  onChange: (next: string) => void;
}) {
  const id = `${idPrefix}-${field.key}`;
  // The unit is part of the label, not a suffix inside the box: 「身高（cm）」
  // leaves no question about whether to type 175 or 175cm.
  const label = field.type === "number" && field.unit !== undefined ? `${field.label}（${field.unit}）` : field.label;

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>

      {field.type === "select" ? (
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={FIELD}>
          {/* The empty option is how a field is cleared: the store deletes the
              key rather than storing "", so "not answered" has one
              representation whether it was never filled in or cleared later. */}
          <option value="">未填</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="text"
          inputMode={field.type === "number" ? "decimal" : undefined}
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={FIELD}
        />
      )}

      {field.hint ? <p className="mt-1 text-micro text-ink-subtle">{field.hint}</p> : null}
    </div>
  );
}

/**
 * The free-text block every agent carries — docs/04_AGENT_SPEC.md §6.
 *
 * A `<textarea>`, and the only control here whose value is not a short fact.
 * `setProfileNotes` is its write path rather than `setProfileField`, because
 * that one trims: it would eat the newline between keystrokes and leave a box
 * that can never hold two lines.
 */
function ProfileNotes({
  value,
  disabled,
  idPrefix,
  onChange,
}: {
  value: string;
  disabled: boolean;
  idPrefix: string;
  onChange: (next: string) => void;
}) {
  const id = `${idPrefix}-notes`;

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        补充说明
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD} resize-y`}
      />
      <p className="mt-1 text-micro text-ink-subtle">上面没问到的，都可以写在这里。</p>
    </div>
  );
}

/**
 * The empty-state line that invites the user to fill the profile in.
 *
 * Its own component, and rendered by `Workspace` rather than by the form,
 * because it belongs to the centre column: it is about there being no
 * conversation yet, and the profile form now lives in the rail — a nudge
 * rendered inside it would appear above the rail's fields, which is not where
 * the empty state is.
 */
export function ProfileNudge({ agent }: { agent: AgentConfig }) {
  const agentId = agent.id;

  const subscribe = useCallback((listener: () => void) => subscribeProfile(agentId, listener), [agentId]);
  const getSnapshot = useCallback(() => profileSnapshot(agentId), [agentId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverProfileSnapshot);

  if (snapshot.status === "loading") return null;
  if (snapshot.status === "session-only" && !snapshot.editable) return null;

  const filled = countFilled(agent.profile, snapshot.fields);
  if (filled > 0) return null;

  // `mb-3` is the gap to the line below it, which is the heading it introduces.
  return <p className="mb-3 text-small text-ink-muted">先花一分钟填一下档案，这位专家的回答会更贴合你的情况。</p>;
}

/** Declared fields with a value, plus 补充说明 when it has one. */
function countFilled(
  declared: readonly ProfileField[] | undefined,
  fields: Readonly<Record<string, string>>,
): number {
  const declaredFilled = (declared ?? []).filter((field) => (fields[field.key] ?? "") !== "").length;
  const notesFilled = (fields[PROFILE_NOTES_KEY] ?? "").trim() !== "" ? 1 : 0;
  return declaredFilled + notesFilled;
}

export function ProfilePanel({
  agent,
  variant = "rail",
  idPrefix,
}: {
  agent: AgentConfig;
  variant?: ProfileVariant;
  /** Required: two instances of this form are in the DOM at once. See the header. */
  idPrefix: string;
}) {
  return <ProfileForm agent={agent} variant={variant} idPrefix={idPrefix} />;
}

function ProfileForm({
  agent,
  variant,
  idPrefix,
}: {
  agent: AgentConfig;
  variant: ProfileVariant;
  idPrefix: string;
}) {
  const agentId = agent.id;
  const declared = agent.profile ?? [];

  const subscribe = useCallback((listener: () => void) => subscribeProfile(agentId, listener), [agentId]);
  const getSnapshot = useCallback(() => profileSnapshot(agentId), [agentId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverProfileSnapshot);

  const [confirmingClear, setConfirmingClear] = useState(false);

  const body = (): ReactNode => {
    // Its own branch, and the only reason the store's snapshot type carries
    // `loading` without a `fields` property: falling through to the form here is
    // the bug where a saved profile flashes as empty, which reads as data loss.
    if (snapshot.status === "loading") {
      return <p className="text-small text-ink-muted">正在读取这个浏览器里保存的档案…</p>;
    }

    const fields = snapshot.fields;

    // The store opened but the record could not be read. A profile may exist
    // that we have never seen, so the form is locked rather than offered — and
    // the empty fields below mean "could not fetch", not "left blank".
    const unreadable = snapshot.status === "session-only" && !snapshot.editable;
    const editable = !unreadable;
    const filled = countFilled(declared, fields);

    return (
      <div className="space-y-4">
        {snapshot.status === "session-only" ? <Notice error={snapshot.error} /> : null}

        {snapshot.status === "ready" && snapshot.saveError !== null ? (
          <Notice
            error={snapshot.saveError}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => retryProfileSave(agentId)}>
                重试
              </Button>
            }
          />
        ) : null}

        {declared.map((field) => (
          <ProfileInput
            key={field.key}
            field={field}
            value={fields[field.key] ?? ""}
            disabled={!editable}
            idPrefix={idPrefix}
            onChange={(next) => setProfileField(agentId, field.key, next)}
          />
        ))}

        <ProfileNotes
          value={fields[PROFILE_NOTES_KEY] ?? ""}
          disabled={!editable}
          idPrefix={idPrefix}
          onChange={(next) => setProfileNotes(agentId, next)}
        />

        {editable && filled > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {confirmingClear ? (
              <>
                <p className="text-small text-ink-muted">清空后这些内容就没了。</p>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    clearProfile(agentId);
                    setConfirmingClear(false);
                  }}
                >
                  确认清空
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingClear(false)}>
                  取消
                </Button>
              </>
            ) : (
              <Button type="button" variant="danger" size="sm" onClick={() => setConfirmingClear(true)}>
                清空档案
              </Button>
            )}
          </div>
        ) : null}

        {editable ? (
          // The honest answer about a second tab, and the reason there is no
          // `BroadcastChannel` here: IndexedDB has no `storage` event, so
          // another tab's edit is invisible and a write from this one replaces
          // the record whole. A channel would make the common case look live
          // while leaving the data-losing case exactly where it is.
          <p className="border-t border-line pt-4 text-micro text-ink-subtle">
            档案保存在这个浏览器里，不跨设备同步；清除站点数据会一并清除。多个标签页同时打开时，改动可能互相覆盖。
          </p>
        ) : null}
      </div>
    );
  };

  const summary = (): string => {
    if (snapshot.status === "loading") return "读取中";
    if (snapshot.status === "session-only" && !snapshot.editable) return "读取失败";
    const filled = countFilled(declared, snapshot.fields);
    return filled === 0 ? "还没填" : `已填 ${filled} 项`;
  };

  const heading = `我的档案 · ${summary()}`;

  if (variant === "strip") {
    return <Disclosure summary={heading}>{body()}</Disclosure>;
  }

  // The rail's idiom: a small heading with content under it, the same shape as
  // every other `Fact` beside it. Not a `<details>` — the whole rail is
  // permanently open, and one accordion among five plain sections reads as a
  // different kind of thing rather than as a collapsed one.
  return (
    <div>
      <h3 className="text-micro font-medium text-ink-subtle">{heading}</h3>
      <div className="mt-1">{body()}</div>
    </div>
  );
}
