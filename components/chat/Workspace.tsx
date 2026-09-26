"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AgentFacts } from "@/components/agent/AgentRails";
import { ChatInput } from "@/components/chat/ChatInput";
import { Markdown } from "@/components/chat/Markdown";
import { RetrievalPanel } from "@/components/chat/RetrievalPanel";
import { Button, buttonClass } from "@/components/ui/Button";
import type { AgentConfig } from "@/lib/agents/types";
import { appError, isAppError, type AppError } from "@/lib/llm/errors";
import { stream } from "@/lib/llm/gateway";
import type { ChatMessage, Credentials } from "@/lib/llm/types";
import type { RetrievedChunk } from "@/lib/rag/bm25";
import { composeSystemPrompt } from "@/lib/rag/context";
import { loadAgentRetriever } from "@/lib/rag/retriever";
import { isConfigured, settingsSnapshot, subscribeSettings } from "@/lib/store/settings";

/**
 * The conversation column and the per-turn state that feeds it — the client half
 * of the workspace (docs/03_UI_UX_SPEC.md §5).
 *
 * The one ordering rule that matters: **retrieval happens before the request, and
 * its failure does not stop the answer.** §8.8 — a retrieval failure is reported
 * in the rail and the model is simply given no reference material, which is the
 * same request as a query that matched nothing. The alternative, failing the
 * turn, would turn a degraded answer into no answer.
 *
 * The chain is explicit and in one place, because it is the product:
 *   load the agent's retriever → retrieve for this message → format the block →
 *   append it to the agent's system prompt → stream the answer.
 */

interface RetrievalState {
  hits: RetrievedChunk[];
  error: AppError | null;
  pending: boolean;
}

const NO_RETRIEVAL: RetrievalState = { hits: [], error: null, pending: false };

type Status = "idle" | "streaming";

/**
 * The server has no `localStorage`, so the prerendered HTML always shows the
 * "no key" state. `useSyncExternalStore` is what makes that correct rather than
 * wrong: React renders with `SERVER_SETTINGS`, then re-renders with the real one
 * as soon as it is listening. A user who has a key never has to look at a prompt
 * to go and add one.
 *
 * Module-level, because an inline `subscribe` would be a new function on every
 * render and React would resubscribe each time.
 */
const SERVER_SETTINGS = () => null;

/** The §9 disclosure. Not a first-run modal, not dismissible. */
function AiNotice() {
  return (
    <p className="text-micro text-ink-subtle">你正在与 AI 智能体对话。</p>
  );
}

export function Workspace({ agent }: { agent: AgentConfig }) {
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot, SERVER_SETTINGS);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<AppError | null>(null);
  const [retrieval, setRetrieval] = useState<RetrievalState>(NO_RETRIEVAL);

  const abort = useRef<AbortController | null>(null);

  // An unmount mid-stream would otherwise leave the fetch running against a
  // component that no longer exists.
  useEffect(() => () => abort.current?.abort(), []);

  const ready = isConfigured(settings);

  /**
   * Runs one turn. `base` is the history *including* the user message, so the
   * retry path can reuse it without appending a duplicate.
   */
  const run = useCallback(
    async (prompt: string, base: ChatMessage[]) => {
      if (!settings) return;

      const credentials: Credentials = {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl.trim() === "" ? undefined : settings.baseUrl.trim(),
        proxyUrl: settings.proxyUrl.trim() === "" ? undefined : settings.proxyUrl.trim(),
      };

      setError(null);
      setStatus("streaming");
      setRetrieval(agent.knowledgeBase === null ? NO_RETRIEVAL : { hits: [], error: null, pending: true });
      setMessages([...base, { role: "assistant", content: "" }]);

      // --- Reference material ------------------------------------------------
      let system = agent.systemPrompt;

      if (agent.knowledgeBase !== null) {
        try {
          const retriever = await loadAgentRetriever(agent.id);
          const hits = retriever.retrieve(prompt);
          system = composeSystemPrompt(agent.systemPrompt, hits);
          setRetrieval({ hits, error: null, pending: false });
        } catch (err) {
          setRetrieval({
            hits: [],
            error: isAppError(err)
              ? err
              : appError("RETRIEVAL_FAILED", err instanceof Error ? err.message : String(err)),
            pending: false,
          });
        }
      }

      // --- The answer --------------------------------------------------------
      const controller = new AbortController();
      abort.current = controller;

      let answer = "";
      let failure: AppError | null = null;

      for await (const chunk of stream({
        providerId: settings.providerId,
        credentials,
        model: settings.model,
        profile: agent.modelProfile,
        system,
        messages: base,
        signal: controller.signal,
      })) {
        if (chunk.type === "text") {
          answer += chunk.value;
          setMessages([...base, { role: "assistant", content: answer }]);
        } else if (chunk.type === "error") {
          // ABORTED is the user's own doing, not a failure to report back to
          // them. Everything else keeps the partial answer on screen (§9).
          if (chunk.error.code !== "ABORTED") failure = chunk.error;
          break;
        } else if (chunk.type === "done") {
          break;
        }
        // `usage` carries no text and is not the end of the stream — falling
        // through is deliberate.
      }

      abort.current = null;
      setStatus("idle");
      setError(failure);

      // An assistant turn with nothing in it is an empty box. Drop it: the error
      // card already explains what happened, and the retry button re-sends from
      // the user message underneath.
      if (answer === "") setMessages(base);
    },
    [agent, settings],
  );

  const send = useCallback(
    (text: string) => {
      void run(text, [...messages, { role: "user", content: text }]);
    },
    [messages, run],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  /**
   * Re-sends the last user message, dropping whatever partial answer followed it.
   * Offered for the `retry` remedy only — a rejected key or a model that does not
   * exist will not become valid by asking again, and those errors link to
   * Settings instead.
   */
  const retry = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === "user") {
        void run(message.content, messages.slice(0, i + 1));
        return;
      }
    }
  }, [messages, run]);

  const clear = useCallback(() => {
    abort.current?.abort();
    setMessages([]);
    setError(null);
    setRetrieval(NO_RETRIEVAL);
  }, []);

  const panel = <RetrievalPanel hits={retrieval.hits} error={retrieval.error} pending={retrieval.pending} />;
  const lastIndex = messages.length - 1;

  return (
    <>
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex w-full max-w-[720px] flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <AiNotice />
            {messages.length > 0 && status === "idle" ? (
              <button
                type="button"
                onClick={clear}
                className="text-micro text-ink-subtle transition-colors duration-150 ease-out hover:text-ink"
              >
                清空对话
              </button>
            ) : null}
          </div>

          <div className="min-h-[40vh]">
            {messages.length === 0 ? (
              <div>
                <p className="text-ink-muted">还没有对话。试试下面这些任务</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {agent.suggestedPrompts.map((prompt) => (
                    <li key={prompt}>
                      <button
                        type="button"
                        disabled={!ready}
                        onClick={() => send(prompt)}
                        className="rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-left text-small text-ink-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {prompt}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, index) => {
                  const key = `${index}-${message.role}`;
                  if (message.role === "user") {
                    return (
                      <div key={key} className="flex justify-end">
                        <div className="max-w-[80%] whitespace-pre-wrap rounded-[var(--radius)] bg-surface-alt px-4 py-2 text-body text-ink">
                          {message.content}
                        </div>
                      </div>
                    );
                  }

                  const isStreamingHere = status === "streaming" && index === lastIndex;

                  return (
                    <div
                      key={key}
                      // The live region covers only the answer being written, so a
                      // screen reader is not re-announcing the whole conversation.
                      aria-live={isStreamingHere ? "polite" : undefined}
                      className="text-body text-ink"
                    >
                      <Markdown source={message.content} />
                      {isStreamingHere ? <span aria-hidden="true" className="caret" /> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error ? (
            <div role="alert" className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <p className="text-small text-danger">{error.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {error.remedy?.kind === "retry" ? (
                  <Button variant="secondary" size="sm" onClick={retry}>
                    重试
                  </Button>
                ) : null}
                {error.remedy?.kind === "new-conversation" ? (
                  <Button variant="secondary" size="sm" onClick={clear}>
                    开一段新对话
                  </Button>
                ) : null}
                {error.remedy !== undefined &&
                error.remedy.kind !== "retry" &&
                error.remedy.kind !== "new-conversation" ? (
                  <Link href="/settings/" className={buttonClass("secondary", "sm")}>
                    去设置
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Below `lg` both rails are hidden, so the retrieval panel is repeated
              here. `display: none` keeps the hidden copy out of the accessibility
              tree, so only one is ever exposed. */}
          <div className="lg:hidden">{panel}</div>

          <div className="sticky bottom-0 bg-bg pb-6 pt-2">
            <ChatInput ready={ready} streaming={status === "streaming"} onSend={send} onStop={stop} />
          </div>
        </div>
      </div>

      {/* The right rail is rendered from here rather than by the page because its
          「本次检索」 section is per-turn state this component owns. `AgentIdentity`
          stays with the page, which needs no state for it. */}
      <AgentFacts agent={agent} retrieval={panel} />
    </>
  );
}
