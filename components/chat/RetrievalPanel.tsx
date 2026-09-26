"use client";

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
      <details className="group">
        <summary className="cursor-pointer list-none">
          <span className="text-micro text-ink-subtle">[{index + 1}]</span>{" "}
          <span className="text-small text-ink-muted group-open:text-ink">{hit.chunk.heading}</span>
        </summary>

        <div className="mt-2 rounded-[var(--radius-sm)] bg-surface-alt p-3">
          <p className="font-mono text-micro text-ink-subtle">{hit.chunk.source}</p>
          {/* The stored chunk text, not a paraphrase — a summary here would
              misrepresent what informed the answer. It is the source text, so a
              chunk carrying the reference delimiters shows them as written; the
              model receives them neutralised (lib/rag/context.ts), and showing
              the original is the more useful of the two. */}
          <p className="mt-2 whitespace-pre-wrap text-small text-ink-muted">{hit.chunk.text}</p>
        </div>
      </details>
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
          <details>
            <summary className="cursor-pointer text-ink-muted">
              命中 {hits.length} 段，展开看看
            </summary>
            <ul className="mt-2 space-y-2">
              {hits.map((hit, index) => (
                <ChunkRow key={hit.chunk.id} hit={hit} index={index} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
