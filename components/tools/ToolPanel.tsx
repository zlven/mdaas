"use client";

import { useState } from "react";

import { TOOL_COMPONENTS } from "@/components/tools/registry";
import type { ToolProps } from "@/components/tools/types";
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
 * Each tool is a `<details>`, the same interaction language as `RetrievalPanel`:
 * keyboard operation and screen-reader announcement come for free (§11).
 */

function ToolSection({ id, onSend, ready, busy }: { id: ToolId } & ToolProps) {
  // Latched, never unset: once a tool has been opened its inputs stay mounted,
  // so collapsing and re-opening does not discard a half-filled form.
  const [opened, setOpened] = useState(false);

  const definition = TOOL_DEFINITIONS[id];
  const Tool = TOOL_COMPONENTS[id];

  return (
    <details
      className="group"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="cursor-pointer list-none text-small text-ink-muted transition-colors duration-150 ease-out hover:text-ink group-open:text-ink">
        工具 · {definition.label}
      </summary>

      <div className="mt-3">
        {/* Rendered on first open rather than on load, so the lazy chunk is
            fetched when the tool is wanted and not when the page is. */}
        {opened ? (
          <>
            <p className="mb-3 text-micro text-ink-subtle">{definition.description}</p>
            <Tool onSend={onSend} ready={ready} busy={busy} />
          </>
        ) : null}
      </div>
    </details>
  );
}

export function ToolPanel({
  tools,
  onSend,
  ready,
  busy,
}: { tools: readonly ToolId[] } & ToolProps) {
  if (tools.length === 0) return null;

  return (
    <section aria-label="工具">
      {tools.map((id) => (
        <ToolSection key={id} id={id} onSend={onSend} ready={ready} busy={busy} />
      ))}
    </section>
  );
}
