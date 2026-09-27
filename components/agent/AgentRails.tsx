import { tintOf } from "@/components/agent/tint";
import type { AgentConfig } from "@/lib/agents/types";
import { TOOL_DEFINITIONS } from "@/lib/tools/types";
import { WORKFLOW_DEFINITIONS } from "@/lib/workflow/registry";

/**
 * The workspace's two rails — docs/03_UI_UX_SPEC.md §5.
 *
 * **The split is the agent on the left and everything else on the right.**
 * `AgentIdentity` describes the expert: its name, what it can do, what it knows,
 * and which tools and workflows it carries. `UserRail` holds what the user
 * authored — the profile, 我的记录, the 资料夹 — and what happened on this turn,
 * the retrieval. Read the two together and the ordering falls out rather than
 * being chosen: the right rail is exactly the sequence the request is assembled
 * in (`lib/rag/context.ts` composes the profile block, the series inside it, then
 * the reference block the folder is numbered into), and the left rail is the only
 * place left for lines that describe the agent itself.
 *
 * It was the other way round until the owner said the right rail held too much.
 * It held eight sections, four of them one-line descriptions of the agent that
 * belong beside its name — and one of those four was a duplicate: the capability
 * tags under the description and the 「能做什么」 line were the same array printed
 * twice. Four sections moved, four stayed, and no section changed meaning.
 *
 * Neither component holds state. `AgentIdentity` is rendered by the page so the
 * identity block is part of the agent's own markup; `UserRail` is rendered from
 * `Workspace`, because its 本次检索 section is per-turn state that lives there.
 * That makes all four of `UserRail`'s sections **slots** — client-rendered state
 * passed in from `Workspace` — which keeps this file free of `"use client"` and
 * leaves `AgentIdentity` a server component.
 */

/** Small heading with content under it — the rail's only idiom. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-micro font-medium text-ink-subtle">{label}</h3>
      <div className="mt-1 text-small text-ink-muted">{children}</div>
    </div>
  );
}

/**
 * The left rail: who this expert is.
 *
 * The describing sections below the identity block are **omitted when empty
 * rather than shown empty** — a "工具：无" line is noise that makes the product
 * look unfinished. The condition is on the value rather than hardcoded, which is
 * what let this file stay untouched as `tools` went from empty everywhere, to
 * three agents, to all ten. The workflow section is where it still earns its
 * keep: six of the ten declare none, and 「暂不支持」 on six cards would read as
 * an unfinished product rather than as ten different specialisms.
 *
 * `tools` and `workflows` hold ids, so their labels are looked up — joining
 * either array directly would print slugs like "food-tef" or
 * "office-meeting-summary", which is a bug this rail has already shipped once.
 */
export function AgentIdentity({ agent }: { agent: AgentConfig }) {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      {/* The same latch as the right rail below, and here it was latent for
          longer: a name, a description and a tag row are short enough never to
          have overflowed, and four describing sections are not. A sticky element
          taller than the viewport pins its top and puts its bottom permanently
          out of reach — the page scrolls, the rail does not, and 工作流 can never
          be read. The focus-ring caveat below applies here too. */}
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-6 overflow-y-auto">
        <div>
          <span
            aria-hidden="true"
            className="icon-plate flex size-10 items-center justify-center rounded-[var(--radius)] text-h2"
            style={{ "--tint": tintOf(agent) } as React.CSSProperties}
          >
            {agent.icon}
          </span>

          <h1 className="mt-4 text-h2 font-semibold text-ink">{agent.nameZh}</h1>
          <p className="text-small text-ink-muted">
            {agent.name} · <span className="text-ink-subtle">AI 智能体</span>
          </p>

          <p className="mt-4 text-small text-ink-muted">{agent.description}</p>
        </div>

        {/* The tags are the capability list, and they are the only place it is
            printed. The right rail used to carry the same array a second time as
            a joined 「能做什么」 line; the tags are the better rendering of it and
            they belong under the name, so the line is gone rather than moved. */}
        <Fact label="能做什么">
          <ul className="flex flex-wrap gap-2">
            {agent.capabilities.map((capability) => (
              <li
                key={capability}
                className="rounded-[var(--radius-sm)] bg-surface-alt px-2 py-1 text-micro text-ink-muted"
              >
                {capability}
              </li>
            ))}
          </ul>
        </Fact>

        <Fact label="知识库">
          {agent.knowledgeBase === null
            ? "未接入"
            : `已接入 ${agent.knowledgeBase} 的知识库，打开对话时按需下载`}
        </Fact>

        {/* The controls live in the centre column; this line only describes the
            agent — which is why the labels live in `lib/tools/types.ts` rather
            than inside the lazily-loaded components. */}
        {agent.tools.length > 0 ? (
          <Fact label="工具">{agent.tools.map((id) => TOOL_DEFINITIONS[id].label).join(" · ")}</Fact>
        ) : null}

        {/* `Record<WorkflowId, WorkflowDefinition>` is total, so there is no
            unresolvable case to fall back from. */}
        {agent.workflows.length > 0 ? (
          <Fact label="工作流">{agent.workflows.map((id) => WORKFLOW_DEFINITIONS[id].label).join(" · ")}</Fact>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * The right rail: the user's own standing data, then this turn.
 *
 * Every section is a slot rendered by `Workspace`, because all four are
 * client-rendered state that lives there. The order they are placed in is the
 * order the request is assembled — see the header above, and the per-section
 * notes below, which are the reason the order is not free to change.
 */
export function UserRail({
  retrieval,
  profile,
  series,
  library,
}: {
  retrieval: React.ReactNode;
  profile: React.ReactNode;
  series: React.ReactNode;
  library: React.ReactNode;
}) {
  return (
    <aside className="hidden w-72 shrink-0 lg:block">
      {/* `max-h` + `overflow-y-auto` rather than a bare `sticky top-24`.
          A sticky element taller than the viewport pins its top and puts its
          bottom permanently out of reach — the page scrolls, the rail does not,
          and the last section can never be read. These four are the tall ones:
          the profile form, the chart with its entry form and point list, the
          folder, and the retrieval. 我的记录 is what made the overflow the normal
          case rather than the edge case, so it is fixed here rather than after
          the first report. (The four one-line describing sections that used to
          sit above them moved to the left rail, which carries the same latch.)

          The focus ring is the known cost: `outline-offset: 2px` is clipped at a
          scroll container's edge, so a control flush against the left or right
          edge loses a pixel of its ring while focused. Padding the container
          would fix it and would also shift every section's left edge away from
          the headings above, so the offsets stay and the ring stays slightly
          clipped — it is a focus ring that is 2px short, not a missing one. */}
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-6 overflow-y-auto">
        {/* First, because the profile block is composed before the reference
            block, and the series summaries are inserted **inside** it — between
            the declared fields and 补充说明. That is why 我的记录 is the section
            directly below this one rather than after the 资料夹, and why the
            whole rail is now one sequence read top to bottom.

            Not a `Fact`: it is the one section here the user operates rather
            than reads. The collapsible controls are all in the centre column;
            this is not one of them. */}
        {profile}

        {/* The rail's order and the profile block's order are one decision
            stated twice, so changing either means changing both. */}
        {series}

        {/* Where the reference block puts it: the folder is numbered ahead of
            the knowledge base (`lib/rag/context.ts`), so the rail reads in the
            sequence the citations do. It sits under the profile for the same
            reason the profile is here at all — both are standing material the
            user opted to carry, against `retrieval` below, which is what
            happened on this turn rather than what the user filed. */}
        {library}

        {retrieval}
      </div>
    </aside>
  );
}
