"use client";

import type { ReactNode, SyntheticEvent } from "react";

/**
 * The collapsible row — docs/03_UI_UX_SPEC.md §5, §11.
 *
 * A `<details>` is the right element: keyboard operation, the expanded/collapsed
 * announcement, and in-page find all come for free, which is what §11 asks of
 * every panel. What it does not give for free is a **consistent marker**. The
 * browser draws `summary`'s triangle itself, differently in every engine, and
 * `list-none` — the obvious way to make the row look like the rest of the page —
 * removes that triangle without putting anything in its place. The result is a
 * row that scans as a static label: no affordance for a mouse, and none at all
 * for touch, where there is no hover to stumble onto.
 *
 * So the marker is hidden explicitly and redrawn here, once. Three call sites
 * had already drifted into hiding it, one had not, and none of them agreed.
 *
 * Mounted twice is fine — all of the state lives in the DOM element, so the
 * `display: none` duplication `Workspace` uses below `lg` is safe here in a way
 * it is not for a form (see `components/tools/ToolPanel.tsx`).
 */

export type DisclosureTone = "panel" | "plain";

/**
 * Aligned to the *first* line of the summary and not centred in it, because the
 * tools' summary is two lines: a centred chevron would drift into the gap
 * between the name and its description. `mt-1` is half of the 20.8px line box
 * the 12px icon sits in.
 *
 * **Why not `group-open:`.** Both `group-open:` and a named `group-open/x:` put
 * a *descendant* combinator in the middle — the compiled rule is
 * `:where(.group…):is([open]…) *`. A `Disclosure` nested inside another (the
 * retrieved-chunk rows inside the hits section) would then have its chevron flip
 * whenever the *outer* one opened, while the row itself stayed closed. The
 * arbitrary variant below spells the chain out with `>` — `[open] > summary > &`
 * — and since the outer `<details>`'s direct child is its body and not a
 * `<summary>`, no ancestor can satisfy it by accident.
 */
const CHEVRON = (
  <svg
    viewBox="0 0 12 12"
    aria-hidden="true"
    className="mt-1 size-3 shrink-0 transition-transform duration-150 ease-out [[open]>summary>&]:rotate-180"
  >
    <path
      d="M2.5 4.5 6 8 9.5 4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * `display: flex` alone removes `::marker` in Chrome and Firefox; Safari still
 * needs `::-webkit-details-marker` hidden by hand. Neither is redundant.
 */
const SUMMARY =
  "flex w-full cursor-pointer list-none items-start gap-2 text-small [&::-webkit-details-marker]:hidden";

const TONE: Record<DisclosureTone, { details?: string; summary: string }> = {
  /**
   * A strip directly in the centre column. This is deliberately the *same*
   * treatment as the suggested-prompt buttons below it (`Workspace.tsx`) —
   * `--surface` fill, 1px `--line`, hover to `--line-strong` — because that is
   * already what this page looks like when something is clickable. Adopting it
   * is the whole fix: the strip was the one control on the screen that did not
   * wear the page's clickable clothes.
   *
   * Hover darkens the border rather than tinting the background, so the row does
   * not flicker as the pointer crosses it.
   */
  panel: {
    details:
      "rounded-[var(--radius)] border border-line bg-surface transition-colors duration-150 ease-out hover:border-line-strong",
    summary: "px-3 py-2 text-ink",
  },
  /**
   * A row inside another panel — a retrieved chunk, say. A second bordered box
   * there would read as a box in a box, so this tone keeps the drawn chevron
   * (the part that fixes discoverability) and drops the container.
   */
  plain: {
    // No `details` key at all, so React omits `class` rather than emitting `class=""`.
    summary:
      "text-ink-muted transition-colors duration-150 ease-out hover:text-ink [[open]>&]:text-ink",
  },
};

export function Disclosure({
  summary,
  children,
  tone = "panel",
  onToggle,
}: {
  summary: ReactNode;
  children?: ReactNode;
  tone?: DisclosureTone;
  onToggle?: (event: SyntheticEvent<HTMLDetailsElement>) => void;
}) {
  // No children means no body element at all, so a collapsed panel that renders
  // its content lazily (`ToolPanel`) does not show a stray hairline under itself.
  const body =
    children === undefined || children === null ? null : (
      <div className={tone === "panel" ? "border-t border-line px-3 py-3" : "mt-2"}>{children}</div>
    );

  // No `group` class on the `<details>`: the two stateful rules (`open` for the
  // chevron and for the plain tone's text colour) both use the child-combinator
  // arbitrary variant described above, precisely so that nesting cannot leak
  // state from an outer disclosure into an inner one.
  return (
    <details className={TONE[tone].details} onToggle={onToggle}>
      <summary className={`${SUMMARY} ${TONE[tone].summary}`}>
        {CHEVRON}
        {/* `flex-1` so the chevron keeps its place on the left and the summary
            takes the remaining width, wrapping under itself rather than beside. */}
        <span className="min-w-0 flex-1">{summary}</span>
      </summary>
      {body}
    </details>
  );
}
