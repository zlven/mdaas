"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AgentFacts } from "@/components/agent/AgentRails";
import { ProfileNudge, ProfilePanel } from "@/components/agent/ProfilePanel";
import { ChatInput } from "@/components/chat/ChatInput";
import { Markdown } from "@/components/chat/Markdown";
import { RetrievalPanel } from "@/components/chat/RetrievalPanel";
import { ToolPanel } from "@/components/tools/ToolPanel";
import { Button, buttonClass } from "@/components/ui/Button";
import { WorkflowRunView } from "@/components/workflow/WorkflowRunView";
import { profileEntries } from "@/lib/agents/profile";
import type { AgentConfig } from "@/lib/agents/types";
import { prepareUpload } from "@/lib/files/parse";
import type { Upload } from "@/lib/files/types";
import { appError, isAppError, type AppError } from "@/lib/llm/errors";
import { stream } from "@/lib/llm/gateway";
import type { ChatMessage, Credentials } from "@/lib/llm/types";
import type { RetrievedChunk } from "@/lib/rag/bm25";
import { composeSystemPrompt } from "@/lib/rag/context";
import { loadAgentRetriever } from "@/lib/rag/retriever";
import { uploadHits } from "@/lib/rag/uploads";
import {
  clearConversation,
  conversationSnapshot,
  serverConversationSnapshot,
  setConversation,
  subscribeConversation,
} from "@/lib/store/conversations";
import { profileSnapshot } from "@/lib/store/memory";
import { isConfigured, settingsSnapshot, subscribeSettings } from "@/lib/store/settings";
import {
  clearRun,
  runSnapshot,
  serverRunSnapshot,
  subscribeRun,
} from "@/lib/store/workflow-runs";
import { retryFrom } from "@/lib/workflow/run";
import { driveRun } from "@/lib/workflow/runner";
import type { WorkflowId } from "@/lib/workflow/types";

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
 *
 * **Uploads join that block, and they are not retrieval.** §8.7 — the head of
 * every attached file is injected verbatim, so it reaches the model whether or
 * not it matches the question; only the overflow past the inline budget is
 * searched. A retrieval-only design cannot satisfy `prompts/*.md`'s 「先说明你读到
 * 了什么」 — an agent cannot describe a document it was never shown.
 *
 * Three consequences that are easy to get wrong and are therefore stated here:
 *
 *   1. **Uploads are not gated on the agent having a knowledge base.** Five of
 *      the nine agents have none, and every one of them can read a file the user
 *      hands it. The `agent.knowledgeBase !== null` check below guards the
 *      retriever only.
 *   2. **The two pools are searched separately.** Upload chunks get their own
 *      index so their scores are not normalised against knowledge chunks' — a
 *      shared index would let a long knowledge corpus push every upload hit below
 *      the score floor at `SCORE_FLOOR_RATIO`.
 *   3. **The upload pool is capped by the budget, not by a count.** §8.7 sets a
 *      per-file inline budget; a file over it contributes its overflow, and
 *      `CONTEXT_TOO_LONG`'s remedy (「去掉一个附件」) is the answer to a prompt that
 *      gets too long, so there is no second global cap here.
 */

interface RetrievalState {
  hits: RetrievedChunk[];
  error: AppError | null;
  pending: boolean;
}

const NO_RETRIEVAL: RetrievalState = { hits: [], error: null, pending: false };

type Status = "idle" | "streaming";

/** The one empty transcript, so "no messages" is a stable reference for React. */
const EMPTY_MESSAGES: readonly ChatMessage[] = Object.freeze([]);

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

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<AppError | null>(null);
  const [retrieval, setRetrieval] = useState<RetrievalState>(NO_RETRIEVAL);
  const [uploads, setUploads] = useState<Upload[]>([]);

  /**
   * The transcript lives in the browser — `01_PRD.md` §5, `06_ACCEPTANCE.md` D7.
   *
   * While the read is in flight the store says `loading` rather than handing back
   * an empty array, and this renders nothing rather than the empty state: a
   * returning visitor watching their conversation disappear and come back reads
   * as data loss, which is the whole thing D7 exists to prevent. Same posture as
   * `ProfilePanel`, which renders no form rather than an empty one.
   */
  const conversation = useSyncExternalStore(
    useCallback((listener) => subscribeConversation(agent.id, listener), [agent.id]),
    useCallback(() => conversationSnapshot(agent.id), [agent.id]),
    serverConversationSnapshot,
  );
  const messages = conversation.status === "ready" ? conversation.messages : EMPTY_MESSAGES;

  /**
   * The run, from the same kind of store — F6.
   *
   * Named `workflowRun` because `run` is already the chat turn below, and one
   * name for both is how a component ends up reading the wrong one.
   */
  const working = useSyncExternalStore(
    useCallback((listener) => subscribeRun(agent.id, listener), [agent.id]),
    useCallback(() => runSnapshot(agent.id), [agent.id]),
    serverRunSnapshot,
  );
  const workflowRun = working.status === "ready" ? working.run : null;

  /**
   * Is the conversation occupied? One flag, because every control that asks the
   * question wants the same answer for both cases: 发送 becomes 停止, ⚡ is
   * refused, and 清空对话 is hidden.
   *
   * The one thing it is not is `status`: a workflow run leaves `status` at
   * `idle`, so anything reading only that would happily start a chat turn beside
   * a running workflow and interleave the two into one transcript. Before this,
   * `ChatInput` and `ToolPanel` were each handed a different spelling of the same
   * idea.
   */
  const busy = status === "streaming" || workflowRun?.status === "running";

  /**
   * One controller for whatever is in flight — a streamed answer or a workflow
   * run, never both, because `busy` gates the controls that start either.
   */
  const abort = useRef<AbortController | null>(null);

  /**
   * Source of `Upload.key`, and therefore of every chunk id this file will
   * produce. Monotonic rather than derived from the filename, because the same
   * file can be attached, removed and attached again — and two attachments of
   * `纪要.pdf` must not share ids in the retrieval index or in React's keys.
   */
  const uploadSeq = useRef(0);

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
      setConversation(agent.id, [...base, { role: "assistant", content: "" }], "immediate");

      // --- Reference material ------------------------------------------------
      // Built before the request and shown before it resolves: every part of this
      // is already known, so leaving the rail empty while the knowledge index is
      // in flight would hide material the user just handed over.
      //
      // The derivation is shared with `lib/workflow/runner.ts` rather than
      // written here. Two copies would not stay equal, and E11/E12 guard the
      // inline budget on exactly this path — the workflow's copy is the newer
      // one, so leaving it inline here is how those two assertions quietly stop
      // covering half the product.
      const uploadChunks = uploadHits(uploads, prompt);

      setRetrieval({ hits: uploadChunks, error: null, pending: agent.knowledgeBase !== null });

      // --- Standing context: the user's profile ------------------------------
      // Read at send time rather than held in state. The store is synchronous, so
      // this is the profile as of this message with no render in between — a
      // value captured in a closure would be one edit stale.
      const snapshot = profileSnapshot(agent.id);
      const profile = snapshot.status === "loading" ? [] : profileEntries(agent.profile, snapshot.fields);

      let knowledgeHits: RetrievedChunk[] = [];
      let retrievalError: AppError | null = null;

      if (agent.knowledgeBase !== null) {
        try {
          const retriever = await loadAgentRetriever(agent.id);
          knowledgeHits = retriever.retrieve(prompt);
        } catch (err) {
          // Recorded, not published here. The uploads survive a knowledge-base
          // failure — their own failure mode is per-file and already on the chip
          // — so the panel has to show the error *and* the file the answer was
          // built from, which means one `setRetrieval` carrying both.
          retrievalError = isAppError(err)
            ? err
            : appError("RETRIEVAL_FAILED", err instanceof Error ? err.message : String(err));
        }
      }

      // Uploads first, then their overflow, then the knowledge base: the file the
      // user handed over this turn outranks background corpus material, and
      // `formatContext` numbers in array order.
      const hits = [...uploadChunks, ...knowledgeHits];
      setRetrieval({ hits, error: retrievalError, pending: false });

      // Composed from all of it, after retrieval has settled, so a knowledge-base
      // failure costs the turn its reference material and nothing else. Building
      // the prompt inside the `try` above would drop the profile on a retrieval
      // error, and the user would read that as the agent having ignored it.
      const system = composeSystemPrompt(agent.systemPrompt, hits, profile);

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
          // Coalesced: the store updates React on every token and schedules at
          // most one write per second. Serialising a whole transcript per token
          // would not, and the visible half is identical either way.
          setConversation(agent.id, [...base, { role: "assistant", content: answer }], "coalesced");
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
      if (answer === "") setConversation(agent.id, base, "immediate");
    },
    [agent, settings, uploads],
  );

  /**
   * Accepts files from the picker and prepares them one at a time.
   *
   * **Sequential on purpose.** PDF and DOCX parsing both run JavaScript on the
   * main thread — the pdf.js worker is not a thread of its own for the caller,
   * and mammoth has no worker at all — so starting three parses at once would
   * freeze the tab for the sum of them with no chip yet on screen to explain why.
   * One at a time means the first chip goes live while the second file is still
   * being read.
   *
   * The chip is appended as `parsing` **before** the work starts, because a 10
   * MiB PDF takes long enough that a chip appearing only on completion reads as
   * a click that did nothing.
   */
  const attach = useCallback(
    (files: File[]) => {
      void (async () => {
        for (const file of files) {
          const key = `u${uploadSeq.current++}`;
          setUploads((previous) => [
            ...previous,
            { key, name: file.name, size: file.size, status: { kind: "parsing" } },
          ]);

          // Never rejects: every failure path in `prepareUpload` resolves to a
          // `failed` status carrying an `AppError`, which is what puts the reason
          // on the chip instead of in the conversation's error card.
          const upload = await prepareUpload(file, agent.id, key);
          setUploads((previous) => previous.map((entry) => (entry.key === key ? upload : entry)));
        }
      })();
    },
    [agent.id],
  );

  const removeUpload = useCallback((key: string) => {
    setUploads((previous) => previous.filter((entry) => entry.key !== key));
  }, []);

  const send = useCallback(
    (text: string) => {
      void run(text, [...messages, { role: "user", content: text }]);
    },
    [messages, run],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  /**
   * ⚡ — one workflow run (docs/01_PRD.md §8, F1).
   *
   * A run is **not** a chat turn: nothing is appended to `messages`. It is its
   * own object in its own store, rendered at the tail of the conversation, which
   * is what lets it survive a reload independently of the transcript — and why
   * `WorkflowRunView` shows the user's ask itself, since no message carries it.
   *
   * The controller is the same ref the chat path uses. That is safe rather than
   * lucky: `busy` covers a running workflow, so the controls that start a turn
   * are refused for as long as one is in flight.
   */
  const startWorkflow = useCallback(
    (workflowId: WorkflowId, input: string) => {
      if (!settings) return;
      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      // The panel describes *this turn's* reference material. A workflow does its
      // own retrieval inside the runner — per step, with a different query — and
      // reports a failure of its own, so leaving the last chat turn's hits on
      // screen beside a run would describe something that is not happening.
      setRetrieval(NO_RETRIEVAL);

      void driveRun({ agent, settings, workflowId, input, uploads, signal: controller.signal }).finally(() => {
        // Identity, not unconditionally: a slower driver finishing after a newer
        // one started must not clear the newer one's controller.
        if (abort.current === controller) abort.current = null;
      });
    },
    [agent, settings, uploads],
  );

  /**
   * F5's retry, and it **resumes** rather than re-running.
   *
   * `retryFrom` returns every finished step as the same object and resets the
   * failed step and everything after it, so this buys one model call for the step
   * that failed and nothing for the ones that did not — §10's "never discard work
   * the user paid for", expressed as an identity.
   *
   * Credentials come from the live settings snapshot, which is what makes F5's
   * test pass: revoke the key mid-run, put a new one in at Settings in another
   * tab, come back and press this, and the resumed step uses the new key. (The
   * revocation itself surfaces as the provider's own 401 rather than as
   * 「没有凭据」, because the key *was* valid when the run began — see
   * `lib/workflow/runner.ts`.)
   */
  const retryStep = useCallback(
    (index: number) => {
      if (!settings || !workflowRun) return;
      const controller = new AbortController();
      abort.current = controller;
      setError(null);

      void driveRun({
        agent,
        settings,
        uploads,
        signal: controller.signal,
        workflowId: workflowRun.workflowId,
        input: workflowRun.input,
        run: retryFrom(workflowRun, index),
      }).finally(() => {
        if (abort.current === controller) abort.current = null;
      });
    },
    [agent, settings, uploads, workflowRun],
  );

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

  /**
   * A new conversation, which per §8.7 also drops the attachments: they belong to
   * the session, not to the agent, and carrying them into a fresh thread would
   * make 「清空对话」 a lie about what is still in the prompt.
   */
  const clear = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    // The store's own action rather than `setConversation(agent.id, [])`: the
    // rule that an emptied transcript deletes its record rather than storing an
    // empty list lives in there, and re-deriving it here is how the two drift.
    clearConversation(agent.id);
    // The run goes with it. A run belongs to the conversation it was started
    // from, and leaving the artefact behind after clearing the thread that
    // produced it would be the same lie as keeping the attachments.
    //
    // Clearing here is also what stops an aborted run from reappearing: the
    // engine settles the abort a microtask later, and `lib/workflow/runner.ts`
    // refuses to commit a run the store no longer holds.
    clearRun(agent.id);
    setError(null);
    setRetrieval(NO_RETRIEVAL);
    setUploads([]);
  }, [agent.id]);

  const panel = <RetrievalPanel hits={retrieval.hits} error={retrieval.error} pending={retrieval.pending} />;
  const lastIndex = messages.length - 1;

  /**
   * Both stores are read asynchronously, so there is a frame before either
   * answers. Rendering the empty state during it would show a returning visitor
   * 「还没有对话」 over a conversation that is about to appear — see the note on
   * `conversation` above.
   */
  const pendingLoad = conversation.status === "loading" || working.status === "loading";

  return (
    <>
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex w-full max-w-[720px] flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* 03_UI_UX_SPEC.md §5 puts `← 返回` at the left of the workspace
                  bar. It lives here rather than above the rails because the rails
                  collapse below `lg` — a way back that disappears on a phone is
                  the one that is needed most. */}
              <Link
                href="/agents/"
                className="text-micro text-ink-muted transition-colors duration-150 ease-out hover:text-ink"
              >
                ← 返回
              </Link>
              <AiNotice />
            </div>
            {(messages.length > 0 || workflowRun !== null) && !busy ? (
              <button
                type="button"
                onClick={clear}
                className="text-micro text-ink-subtle transition-colors duration-150 ease-out hover:text-ink"
              >
                清空对话
              </button>
            ) : null}
          </div>

          {/* Below `lg` the rail is gone, so the profile is repeated here as a
              collapsed strip — the same duplication the retrieval panel uses
              two blocks down, and for the same reason: a control that vanishes
              on a phone is worse than a duplicated one. It is safe only because
              the form keeps no draft of its own, and only if the two copies do
              not share element ids, which is what `idPrefix` is for. See the
              note in components/agent/ProfilePanel.tsx — the tools below could
              not be treated this way.

              `send` is passed rather than a bare setter so a tool's result
              enters the conversation as an ordinary user turn, with retrieval
              and history behaving exactly as if it had been typed. */}
          <div className="lg:hidden">
            <ProfilePanel agent={agent} variant="strip" idPrefix="strip" />
          </div>

          <ToolPanel tools={agent.tools} onSend={send} ready={ready} busy={busy} />

          <div className="min-h-[40vh]">
            {pendingLoad ? null : messages.length === 0 && workflowRun === null ? (
              <div>
                {/* The onboarding line. It lives here rather than inside the
                    profile form because it is about there being no
                    conversation yet, and the form is now in the rail. */}
                <ProfileNudge agent={agent} />
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

                {/* The run, at the tail of the conversation it was started from —
                    03_UI_UX_SPEC.md §7's "inline where the workflow was invoked,
                    not a modal". Its own store, so it renders here whether it was
                    started in this session or read back after a reload. */}
                {workflowRun ? (
                  <WorkflowRunView
                    run={workflowRun}
                    saveFailed={working.status === "ready" && working.saveFailed}
                    notice={working.status === "ready" ? working.notice : null}
                    onRetry={retryStep}
                  />
                ) : null}
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
            <ChatInput
              ready={ready}
              busy={busy}
              uploads={uploads}
              workflows={agent.workflows}
              onSend={send}
              onRunWorkflow={startWorkflow}
              onStop={stop}
              onAttach={attach}
              onRemoveUpload={removeUpload}
            />
          </div>
        </div>
      </div>

      {/* The right rail is rendered from here rather than by the page because its
          「本次检索」 section is per-turn state this component owns. `AgentIdentity`
          stays with the page, which needs no state for it. */}
      <AgentFacts
        agent={agent}
        retrieval={panel}
        profile={<ProfilePanel agent={agent} variant="rail" idPrefix="rail" />}
      />
    </>
  );
}
