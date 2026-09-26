"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { FIELD, LABEL } from "@/components/ui/field";
import { Notice } from "@/components/ui/Notice";
import type { AgentConfig, ProfileField } from "@/lib/agents/types";
import {
  clearProfile,
  profileSnapshot,
  retryProfileSave,
  serverProfileSnapshot,
  setProfileField,
  subscribeProfile,
} from "@/lib/store/memory";

/**
 * The profile form — docs/04_AGENT_SPEC.md §6, docs/03_UI_UX_SPEC.md §5
 *
 * The fields are the agent's to declare (`AgentConfig.profile`), the values are
 * the user's, and this component only joins them. Nothing here knows what a 身高
 * is, which is what makes adding a field a config edit rather than a code change
 * (acceptance C4).
 *
 * **Mounted exactly once**, in the centre column — see `components/tools/ToolPanel.tsx`
 * for why the `lg:hidden` duplication `Workspace` uses for the retrieval panel
 * would be wrong here. A form mounted twice is two independent drafts.
 *
 * Writes go through on every keystroke, with no save button and no local draft.
 * The store is optimistic, so the field updates on the same tick, and coalescing
 * keeps IndexedDB to one write per round trip. A draft would buy nothing and cost
 * the one thing that matters: there would be a state in which what is on screen
 * and what the agent will be told are different.
 */

/**
 * The collapsed row, matching the tools strip and `RetrievalPanel`'s `<details>`.
 *
 * The summary carries the noun (「我的档案」) because there is no heading above it
 * — the PRD wireframe (§3.3) puts these strips in one line each above the
 * conversation, where a two-line heading-plus-summary would push the answer down.
 */
function Strip({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-small text-ink-muted transition-colors duration-150 ease-out hover:text-ink group-open:text-ink">
        我的档案 · {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function ProfileInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ProfileField;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const id = `profile-${field.key}`;
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
          {/* The empty option is how a field is cleared: `setProfileField` deletes
              the key rather than storing "", so "not answered" has one
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

export function ProfilePanel({ agent, nudge = false }: { agent: AgentConfig; nudge?: boolean }) {
  // No hooks above this line, so an agent that declares no profile fields returns
  // before subscribing and never causes a read.
  if ((agent.profile ?? []).length === 0) return null;
  return <ProfileForm agent={agent} nudge={nudge} />;
}

function ProfileForm({ agent, nudge }: { agent: AgentConfig; nudge: boolean }) {
  const agentId = agent.id;
  const declared = agent.profile ?? [];

  const subscribe = useCallback((listener: () => void) => subscribeProfile(agentId, listener), [agentId]);
  const getSnapshot = useCallback(() => profileSnapshot(agentId), [agentId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverProfileSnapshot);

  const [confirmingClear, setConfirmingClear] = useState(false);

  // Its own branch, and the only reason the store's snapshot type carries
  // `loading` without a `fields` property: falling through to the form here is
  // the bug where a saved profile flashes as empty, which reads as data loss.
  if (snapshot.status === "loading") {
    return (
      <Strip summary="读取中…">
        <p className="text-small text-ink-subtle">读取中…</p>
      </Strip>
    );
  }

  const fields = snapshot.fields;

  // The store opened but the record could not be read. A profile may exist that
  // we have never seen, so the form is locked rather than offered — and the empty
  // fields below mean "could not fetch", not "left blank", which is why the
  // summary must not say 还没填.
  const unreadable = snapshot.status === "session-only" && !snapshot.editable;
  const editable = !unreadable;

  const filled = declared.filter((field) => (fields[field.key] ?? "") !== "").length;
  const summary = unreadable ? "读取失败" : filled === 0 ? "还没填" : `已填 ${filled} 项`;

  return (
    <>
      {/* The onboarding line, and only at the moment it is useful: no
          conversation yet, nothing filled in, and a form that can actually be
          filled. */}
      {nudge && editable && filled === 0 ? (
        <p className="text-small text-ink-muted">先花一分钟填一下档案，这位专家的回答会更贴合你的情况。</p>
      ) : null}

      <Strip summary={summary}>
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
              onChange={(next) => setProfileField(agentId, field.key, next)}
            />
          ))}

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
      </Strip>
    </>
  );
}
