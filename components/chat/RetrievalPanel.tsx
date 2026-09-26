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

      {/* The three branches below read the same whichever way this resolves.
          Note that the hits branch used to keep `summary`'s native triangle
          while every chunk row under it had theirs hidden — the same control
          behaving two ways on one screen, which is the drift `Disclosure`
          exists to stop. */}
      <div className="mt-1 text-small text-ink-muted">
        {error ? (
          // RETRIEVAL_FAILED is not fatal: the answer continues from general
          // knowledge and says so (§8.8). Saying that here keeps the panel from
          // reading as an outage.
          <p>{error.message}</p>
        ) : pending ? (
          <p>正在检索这位专家的知识库…</p>
        ) : hits.length === 0 ? (
          <p>这次没有命中知识库里的内容。</p>
        ) : (
          <Disclosure tone="plain" summary={`命中 ${hits.length} 段，展开看看`}>
            <ul className="space-y-2">
              {hits.map((hit, index) => (
                <ChunkRow key={hit.chunk.id} hit={hit} index={index} />
              ))}
            </ul>
          </Disclosure>
        )}
      </div>
    </section>
  );
}
