"use client";

import { Disclosure } from "@/components/ui/Disclosure";
import type { AppError } from "@/lib/llm/errors";
import type { RetrievedChunk } from "@/lib/rag/bm25";

/**
 * What was retrieved this turn — docs/03_UI_UX_SPEC.md §5, docs/01_PRD.md §7.
 *
 * "A differentiator, not chrome." Without it, "each agent has its own knowledge
 * base" is an unverifiable claim a visitor has to take on faith. It is also what
 * makes acceptance E2/E3 checkable by looking rather than by instrumenting.
 *
 * `<details>` rather than a button with state: expanding is then keyboard
 * operable, screen-reader announceable, and findable by in-page search for free
 * (§11 requires keyboard-operable panels).
 *
 * Collapsed by default. A user who wants the answer should not have to scroll
 * past the evidence to reach it.
 *
 * `hits` is the whole reference block, not only what the retriever matched: an
 * attached file's injected text is in there too (§8.7), and so is a saved
 * document's — this turn's attachments and the 资料夹 come first, then the
 * corpus. Each row is distinguishable by its `source`, which is the filename for
 * anything the user supplied, and each row's heading says 资料夹 for a document
 * that came from the folder. The heading stays
 * 「本次检索」 because that is what §5 names the section, and the count in the
 * summary is honest about being everything the model was given.
 */

function ChunkRow({ hit, index }: { hit: RetrievedChunk; index: number }) {
  return (
    <li>
      {/* `plain` tone: this row already sits inside the section's disclosure, and
          a bordered box within a bordered box reads as a mistake. The heading
          carries no colour of its own so it inherits the summary's — dim until
          hovered or opened, then ink. */}
      <Disclosure
        tone="plain"
        summary={
          <>
            <span className="text-micro text-ink-subtle">[{index + 1}]</span>{" "}
            <span>{hit.chunk.heading}</span>
          </>
        }
      >
        <div className="rounded-[var(--radius-sm)] bg-surface-alt p-3">
          <p className="font-mono text-micro text-ink-subtle">{hit.chunk.source}</p>
          {/* The stored chunk text, not a paraphrase — a summary here would
              misrepresent what informed the answer. It is the source text, so a
              chunk carrying the reference delimiters shows them as written; the
              model receives them neutralised (lib/rag/context.ts), and showing
              the original is the more useful of the two. */}
          <p className="mt-2 whitespace-pre-wrap text-small text-ink-muted">{hit.chunk.text}</p>
        </div>
      </Disclosure>
    </li>
  );
}

export function RetrievalPanel({
  hits,
  error,
  pending,
}: {
  hits: RetrievedChunk[];
  error: AppError | null;
  pending: boolean;
}) {
  return (
    <section aria-labelledby="retrieval-heading">
      <h3 id="retrieval-heading" className="text-micro font-medium text-ink-subtle">
        本次检索
      </h3>

      {/* These are four independent statements, not four branches of one.
          They used to be a chain, which was correct while every source of hits
          shared a single fate — an upload does not. A failed knowledge index
          leaves the attached file's text in the prompt, and a query that matches
          nothing in the corpus still carries the file the user handed over. A
          chain would have shown the error and silently hidden the material the
          answer was actually built from.

          The `hits` branch also used to keep `summary`'s native triangle while
          every chunk row under it had theirs hidden — the same control behaving
          two ways on one screen, which is the drift `Disclosure` exists to stop. */}
      <div className="mt-1 space-y-1 text-small text-ink-muted">
        {error ? (
          // RETRIEVAL_FAILED is not fatal: the answer continues from general
          // knowledge and says so (§8.8). Saying that here keeps the panel from
          // reading as an outage.
          <p>{error.message}</p>
        ) : null}

        {pending ? <p>正在检索这位专家的知识库…</p> : null}

        {/* 「任何参考资料」, not 「知识库里的内容」. The block this panel reports on
            has held three pools since the 资料夹 landed — this turn's
            attachments, the folder, and the knowledge base — and the panel
            counts all of them (`hits`). The narrower sentence was already
            incomplete before that, and it is the one line here that names what
            was searched rather than what was found. */}
        {!pending && hits.length === 0 ? <p>这次没有命中任何参考资料。</p> : null}

        {hits.length > 0 ? (
          // Counts the attached files' injected text as well as retrieved chunks
          // — both are in the prompt's reference block, and the rows below name
          // where each came from (`hit.chunk.source`).
          <Disclosure tone="plain" summary={`命中 ${hits.length} 段，展开看看`}>
            <ul className="space-y-2">
              {hits.map((hit, index) => (
                <ChunkRow key={hit.chunk.id} hit={hit} index={index} />
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </div>
    </section>
  );
}
