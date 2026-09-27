import type { ReactNode } from "react";

/**
 * The rail section — the rail's only idiom, declared once.
 * docs/03_UI_UX_SPEC.md §5.
 *
 * A heading with content under it. Five panels render this shape
 * (`AgentRails`'s `Fact`, `ProfilePanel`, `SeriesPanel`, `LibraryPanel`,
 * `RetrievalPanel`) and until this file existed each of them carried its own
 * copy of the class string. Four copies of a Tailwind string are identical
 * right up until one of them is edited — which is the argument
 * `components/ui/field.ts` already makes for the form controls, and the one
 * `Disclosure`'s header records paying for when three call sites drifted on a
 * disclosure marker.
 *
 * **Why the heading is `--text-h3` and not `--text-micro`.** It used to be
 * 12px in `--ink-subtle` — which put every section heading in the rail
 * *below* the 13px `--ink-muted` body under it, smaller and paler than the
 * thing it was introducing. §2's own type table says Micro is for "badges,
 * tags" and Small for "captions, metadata"; a section heading is neither. The
 * heading now outranks its content, which is the whole of what was wrong.
 *
 * The note stays Small and subtle on purpose: it is a count (`已填 3 项`),
 * and a count is a caption. `items-baseline` keeps it sitting on the
 * heading's baseline rather than centred against a 16px line box, and
 * `flex-wrap` lets it drop to its own line in a 240px rail instead of
 * squeezing the title.
 */
export function RailSection({
  id,
  title,
  note,
  bodyClassName,
  children,
}: {
  /** For `aria-labelledby` — only `RetrievalPanel` needs one today. */
  id?: string;
  title: string;
  /** The count or state that rides beside the title. Omitted when there is none. */
  note?: string;
  /**
   * The body's own classes, appended to `mt-2`. Callers keep control of this
   * because the rail's sections hold different *kinds* of content and the
   * spacing above them is the only thing this component should be deciding:
   * a sentence gets `text-body`, a dense list of excerpts stays `text-small`.
   */
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 id={id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-h3 font-semibold text-ink">{title}</span>
        {note !== undefined && note !== "" ? <span className="text-small text-ink-subtle">{note}</span> : null}
      </h3>
      <div className={`mt-2 ${bodyClassName ?? ""}`}>{children}</div>
    </div>
  );
}
