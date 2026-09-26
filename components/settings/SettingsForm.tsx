"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { FIELD as FIELD_CLASS, LABEL as LABEL_CLASS } from "@/components/ui/field";
import type { AppError } from "@/lib/llm/errors";
import { PROVIDER_LABELS, SUGGESTED_MODELS, validate } from "@/lib/llm/gateway";
import type { Credentials, ProviderId } from "@/lib/llm/types";
import {
  DEFAULT_SETTINGS,
  clearSettings,
  maskKey,
  saveSettings,
  settingsSnapshot,
  subscribeSettings,
  type ProviderSettings,
} from "@/lib/store/settings";

/**
 * Settings — docs/03_UI_UX_SPEC.md §8.
 *
 * "Deliberately plain. Four fields and a status line." Everything the SRS
 * describes for settings — team, permissions, audit, billing — is out of scope
 * and must not appear.
 *
 * The one rule with no room in it: **the saved key is never rendered.** Not as
 * an input value, not revealed on focus. The key input is always empty, and what
 * the user sees in its place is `maskKey(...)` as the *placeholder* — which is
 * text, cannot be submitted, and cannot be revealed by the browser's password
 * toggle, because there is nothing behind it. Leaving the field blank means
 * "keep the stored key", which is the only reading that does not risk silently
 * replacing a working key with nothing.
 */

const SERVER_SETTINGS = () => null;

type Status =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "ok"; models: string[] }
  | { kind: "error"; error: AppError };

// Shared with the profile form — see components/ui/field.ts.
const FIELD = FIELD_CLASS;
const LABEL = LABEL_CLASS;

export function SettingsForm() {
  const saved = useSyncExternalStore(subscribeSettings, settingsSnapshot, SERVER_SETTINGS);

  // The form shows the store, overridden by whatever the user has changed since
  // opening the page. Nothing is copied into state on mount, so there is no
  // window where the form shows a default while the store already has a value.
  const [draft, setDraft] = useState<Partial<ProviderSettings>>({});
  const [keyDraft, setKeyDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [justSaved, setJustSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const base = saved ?? DEFAULT_SETTINGS;
  const providerId = draft.providerId ?? base.providerId;
  const model = draft.model ?? base.model;
  const baseUrl = draft.baseUrl ?? base.baseUrl;
  const proxyUrl = draft.proxyUrl ?? base.proxyUrl;

  // A key only belongs to the provider it was entered for. Switching provider
  // does not carry it across, which is why this is not simply `base.apiKey`.
  const storedKey = saved !== null && saved.providerId === providerId && saved.apiKey.trim() !== "" ? saved.apiKey : "";
  const apiKey = keyDraft.trim() !== "" ? keyDraft.trim() : storedKey;

  const dirty =
    providerId !== base.providerId ||
    model !== base.model ||
    baseUrl !== base.baseUrl ||
    proxyUrl !== base.proxyUrl ||
    keyDraft.trim() !== "";

  function credentials(): Credentials {
    return {
      apiKey,
      baseUrl: baseUrl.trim() === "" ? undefined : baseUrl.trim(),
      proxyUrl: proxyUrl.trim() === "" ? undefined : proxyUrl.trim(),
    };
  }

  function save() {
    saveSettings({ providerId, apiKey, model, baseUrl, proxyUrl });
    // The key is in the store now; the input goes back to empty so the mask
    // placeholder is what shows. The rest of the draft is dropped so the form
    // reads from the store again.
    setKeyDraft("");
    setDraft({});
    setJustSaved(true);
    setStatus({ kind: "idle" });
    window.setTimeout(() => setJustSaved(false), 2000);
  }

  async function verify() {
    setStatus({ kind: "verifying" });
    const result = await validate(providerId, credentials());
    setStatus(result.ok ? { kind: "ok", models: result.models } : { kind: "error", error: result.error });
  }

  function remove() {
    clearSettings();
    setKeyDraft("");
    setDraft({});
    setConfirmingDelete(false);
    setStatus({ kind: "idle" });
  }

  const suggestions = [...new Set([...(SUGGESTED_MODELS[providerId] ?? []), ...(status.kind === "ok" ? status.models : [])])];

  return (
    <div className="max-w-xl">
      <div className="space-y-6">
        <div>
          <label htmlFor="provider" className={LABEL}>
            模型服务商
          </label>
          <select
            id="provider"
            value={providerId}
            onChange={(event) => {
              const next = event.target.value as ProviderId;
              // The model name belongs to the provider it came from.
              setDraft((current) => ({ ...current, providerId: next, model: "" }));
              setStatus({ kind: "idle" });
            }}
            className={FIELD}
          >
            {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => (
              <option key={id} value={id}>
                {PROVIDER_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="api-key" className={LABEL}>
            API Key
          </label>
          <div className="flex gap-2">
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              // Always the mask, never the key. See the note at the top.
              placeholder={storedKey === "" ? "粘贴你的 API Key" : maskKey(storedKey)}
              onChange={(event) => setKeyDraft(event.target.value)}
              className={FIELD}
            />
            <Button
              type="button"
              variant="secondary"
              className="mt-1 shrink-0"
              disabled={apiKey === "" || status.kind === "verifying"}
              onClick={() => void verify()}
            >
              {status.kind === "verifying" ? "验证中…" : "验证"}
            </Button>
          </div>

          <div className="mt-2 text-small" aria-live="polite">
            {status.kind === "ok" && status.models.length > 0 ? (
              <p className="text-success">● 已连接，读到 {status.models.length} 个模型。</p>
            ) : null}
            {status.kind === "ok" && status.models.length === 0 ? (
              // 05_API_SPEC.md §5 allows a provider with no `/models` endpoint.
              // A 404 there says the host answered; it says nothing about the
              // key, and claiming otherwise would be a verification that
              // verified nothing. This fallback is not implemented — `validate`
              // receives no model name to probe with.
              <p className="text-ink-muted">
                ● 服务商有响应，但它没有模型列表接口，所以这把 Key 没有被验证。直接发一条消息就知道能不能用。
              </p>
            ) : null}
            {status.kind === "error" ? <p className="text-danger">{status.error.message}</p> : null}
          </div>
        </div>

        <div>
          <label htmlFor="model" className={LABEL}>
            模型
          </label>
          <input
            id="model"
            list="model-suggestions"
            value={model}
            spellCheck={false}
            placeholder="gpt-4o / deepseek-chat / …"
            onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
            className={FIELD}
          />
          <datalist id="model-suggestions">
            {suggestions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <p className="mt-1 text-micro text-ink-subtle">
            填服务商那边的模型 ID。验证通过后会列出你这个账户能用的模型。
          </p>
        </div>

        {/* `compatible` is the only provider with no default endpoint, and the
            only one the adapter routes through a proxy (05_API_SPEC.md §6).
            Showing either field for OpenAI would offer a control that does
            nothing. */}
        {providerId === "compatible" ? (
          <>
            <div>
              <label htmlFor="base-url" className={LABEL}>
                接口地址
              </label>
              <input
                id="base-url"
                value={baseUrl}
                spellCheck={false}
                placeholder="https://api.deepseek.com/v1"
                onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                className={FIELD}
              />
            </div>

            <div>
              <label htmlFor="proxy-url" className={LABEL}>
                代理地址（可选）
              </label>
              <input
                id="proxy-url"
                value={proxyUrl}
                spellCheck={false}
                placeholder="https://your-worker.workers.dev"
                onChange={(event) => setDraft((current) => ({ ...current, proxyUrl: event.target.value }))}
                className={FIELD}
              />
              <p className="mt-1 text-micro text-ink-subtle">
                有些服务商不允许网页直接调用它。填一个转发地址，请求就能发出去。这个地址只是一个管道，它不保存你的 Key，也不需要它自己的 Key。
              </p>
            </div>
          </>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="button" disabled={!dirty} onClick={save}>
            保存
          </Button>
          {justSaved ? (
            <span className="text-small text-ink-muted" aria-live="polite">
              已保存
            </span>
          ) : null}
        </div>
      </div>

      <section className="mt-12 border-t border-line pt-6">
        <h2 className="text-h3 font-semibold text-ink">这把 Key 存在哪里</h2>
        <p className="mt-3 text-small text-ink-muted">
          存在这个浏览器里，只在你发消息的时候直接发给服务商。它不经过我们的服务器，也不会同步到其他设备。
          它在浏览器里没有加密——任何能打开这台电脑的人都能看到它。公共电脑上不要填。
        </p>
        <p className="mt-3 text-small text-ink-muted">
          费用记在你自己的服务商账户上，这个平台不代收也不加价。
        </p>
      </section>

      <section className="mt-8 border-t border-line pt-6">
        <h2 className="text-h3 font-semibold text-ink">删除 Key</h2>
        {saved === null ? (
          <p className="mt-3 text-small text-ink-muted">还没有保存过 Key。</p>
        ) : confirmingDelete ? (
          <div className="mt-3 flex items-center gap-3">
            <p className="text-small text-ink-muted">删除后要重新填写才能继续对话。</p>
            <Button type="button" variant="danger" size="sm" onClick={remove}>
              确认删除
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              取消
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <p className="text-small text-ink-muted">当前保存的是 {maskKey(saved.apiKey)}。</p>
            <Button type="button" variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
              删除
            </Button>
          </div>
        )}
      </section>

      <p className="mt-12 text-small text-ink-muted">
        填好了？<Link href="/agents/" className="underline underline-offset-2">挑一位专家开始</Link>。
      </p>
    </div>
  );
}
