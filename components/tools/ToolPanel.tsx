"use client";

import { useState } from "react";

import { TOOL_COMPONENTS } from "@/components/tools/registry";
import type { ToolProps } from "@/components/tools/types";
import { Disclosure } from "@/components/ui/Disclosure";
import { TOOL_DEFINITIONS, type ToolId } from "@/lib/tools/types";

/**
 * The instant tools, in the centre column — docs/04_AGENT_SPEC.md §7,
 * docs/03_UI_UX_SPEC.md §5
 *
 * **Mounted exactly once, here.** `Workspace` repeats the retrieval panel below
 * `lg` so the narrow layout keeps it, and that repetition is not conditional
 * rendering — both copies are in the DOM with one hidden by `display: none`.
 * That is safe for a stateless panel showing the same thing twice and unsafe for
 * anything holding input: two copies are two independent drafts, and typing into
 * the visible one and then widening the window past `lg` would silently discard
 * what was typed. The centre column is the one position present at every
 * breakpoint, so this is the only place the tools are mounted.
 *
 * The right rail still lists tool *names* (`AgentFacts`). That is a description
 * of the agent, like 能力 or 知识库, and not an operation — which is why the name
 * lives in `lib/tools/types.ts` rather than inside the lazily-loaded component.
 *
 * Each tool is a `<Disclosure>`, the same interaction language as `RetrievalPanel`
 * — the drawn chevron lives in `components/ui/Disclosure.tsx`, because hiding
 * `summary`'s native marker without drawing a replacement is what made these
 * rows read as labels rather than controls.
 *
 * The collapsed row carries the tool's name **and the one line saying what it
 * does**. §5 requires it: 「会议成本」 alone is a noun a first-time visitor cannot
 * price, and the description is the only thing on the page that sells the tool.
 * There is no 「工具 · 」 prefix — the section is labelled for assistive tech, and
 * the promise line says what this is far better than the word 工具 did.
 */

function ToolSection({ id, onSend, ready, busy }: { id: ToolId } & ToolProps) {
  // Latched, never unset: once a tool has been opened its inputs stay mounted,
  // so collapsing and re-opening does not discard a half-filled form.
  const [opened, setOpened] = useState(false);

  const definition = TOOL_DEFINITIONS[id];
  const Tool = TOOL_COMPONENTS[id];

  return (
    <Disclosure
      summary={
        <>
          <span className="font-medium">{definition.label}</span>
          <span className="mt-0.5 block text-ink-muted">{definition.description}</span>
        </>
      }
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      {/* Rendered on first open rather than on load, so the lazy chunk is
          fetched when the tool is wanted and not when the page is. The
          description is not repeated here — it is in the row above. */}
      {opened ? <Tool onSend={onSend} ready={ready} busy={busy} /> : null}
    </Disclosure>
  );
}

export function ToolPanel({
  tools,
  onSend,
  ready,
  busy,
}: { tools: readonly ToolId[] } & ToolProps) {
  if (tools.length === 0) return null;

  // Two bordered panels stacked flush would read as one, so they are spaced —
  // which matters as soon as an agent declares a second tool.
  return (
    <section aria-label="工具" className="space-y-2">
      {tools.map((id) => (
        <ToolSection key={id} id={id} onSend={onSend} ready={ready} busy={busy} />
      ))}
    </section>
  );
}
