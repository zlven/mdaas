"use client";

import { useId, useState } from "react";

import { TOOL_COMPONENTS } from "@/components/tools/registry";
import type { ToolProps } from "@/components/tools/types";
import { TOOL_DEFINITIONS, type ToolId } from "@/lib/tools/types";

/**
 * The instant tools, in the centre column — docs/04_AGENT_SPEC.md §7,
 * docs/03_UI_UX_SPEC.md §5
 *
 * **Mounted exactly once, here.** `Workspace` repeats the retrieval panel and
 * the profile below `lg` so the narrow layout keeps them, and that repetition is
 * not conditional rendering — both copies are in the DOM with one hidden by
 * `display: none`. That is safe for a stateless panel and for a form whose
 * inputs are controlled from a store, and unsafe for these: a tool's inputs are
 * `useState`, so two copies are two independent drafts, and typing into the
 * visible one and then widening the window past `lg` would silently discard what
 * was typed. The centre column is the one position present at every breakpoint,
 * so this is the only place the tools are mounted.
 *
 * **One row of chips, not one disclosure per tool.** At two lines each a
 * stacked list spends the whole top of the conversation on three tools, and the
 * count was expected to grow — the arrangement has to cost the same at five tools
 * as at one. So the chips are a selector and there is a single panel below them.
 *
 * The count did grow: there are ten tools now. They are spread one per agent, so
 * no strip has yet rendered more than a single chip and the wrap behaviour this
 * paragraph is about remains unexercised in a browser — `docs/06_ACCEPTANCE.md`
 * D11 is the check that would exercise it. The design is unchanged and the
 * reasoning above still stands; it has simply not been asked to prove itself.
 *
 * The consequences, each of which is a decision rather than a detail:
 *
 *   1. **Nothing is open by default.** A panel open on arrival spends exactly
 *      the height the chip row was built to save.
 *   2. **The description moves into the panel.** §5 used to require it on the
 *      collapsed row, which a one-line chip cannot carry. It is still the first
 *      thing inside, above every input — see the section in the UI spec.
 *   3. **A tool that has been opened stays mounted**, hidden with the `hidden`
 *      attribute rather than unmounted. Switching to another tool and back must
 *      not lose a half-filled 会议成本; that is the same latch the previous
 *      per-tool `<details>` had.
 *
 * The right rail still lists tool *names* (`AgentFacts`). That is a description
 * of the agent, like 能力 or 知识库, and not an operation — which is why the name
 * lives in `lib/tools/types.ts` rather than inside the lazily-loaded component.
 *
 * The chips are `<button>`s and draw no chevron, unlike every `<details>` in the
 * workspace. The chevron exists there to replace the `<summary>` marker that
 * `list-none` removes, because without it a collapsed row reads as a static
 * label. A bordered button already reads as a control, so it needs nothing.
 */

const CHIP =
  "rounded-[var(--radius-sm)] border px-3 py-1.5 text-micro transition-colors duration-150 ease-out";

function chipClass(open: boolean): string {
  return open
    ? `${CHIP} border-line-strong bg-surface-alt text-ink`
    : `${CHIP} border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink`;
}

export function ToolPanel({
  tools,
  onSend,
  ready,
  busy,
}: { tools: readonly ToolId[] } & ToolProps) {
  const [openId, setOpenId] = useState<ToolId | null>(null);
  // Latched, never unset: once a tool has been opened its inputs stay mounted.
  const [loaded, setLoaded] = useState<readonly ToolId[]>([]);

  // The single element every chip points at with `aria-controls`. It always
  // exists, so no chip ever references an id that is not in the document —
  // which is what would happen if each chip pointed at its own panel.
  const panelId = useId();

  if (tools.length === 0) return null;

  function toggle(id: ToolId): void {
    setOpenId((current) => (current === id ? null : id));
    setLoaded((current) => (current.includes(id) ? current : [...current, id]));
  }

  return (
    <section aria-label="工具" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tools.map((id) => {
          const open = openId === id;
          return (
            <button
              key={id}
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(id)}
              className={chipClass(open)}
            >
              {TOOL_DEFINITIONS[id].label}
            </button>
          );
        })}
      </div>

      <div id={panelId}>
        {loaded.map((id) => {
          const definition = TOOL_DEFINITIONS[id];
          const Tool = TOOL_COMPONENTS[id];

          return (
            // `hidden` rather than unmounting, so the tool's inputs survive a
            // look at a different tool. It also keeps the hidden panels out of
            // the accessibility tree and the tab order.
            <div
              key={id}
              hidden={openId !== id}
              role="region"
              aria-label={definition.label}
              className="rounded-[var(--radius)] border border-line bg-surface p-3"
            >
              <p className="text-small text-ink-muted">{definition.description}</p>
              <div className="mt-3 border-t border-line pt-3">
                <Tool onSend={onSend} ready={ready} busy={busy} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
