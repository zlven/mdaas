import { tintOf } from "@/components/agent/tint";
import type { AgentConfig } from "@/lib/agents/types";
import { TOOL_DEFINITIONS } from "@/lib/tools/types";
import { WORKFLOW_DEFINITIONS } from "@/lib/workflow/registry";

/**
 * The workspace's two rails — docs/03_UI_UX_SPEC.md §5.
 *
 * Neither holds state, and `AgentIdentity` is rendered by the page so the
 * identity block is part of the agent's own markup. `AgentFacts` is rendered from
 * `Workspace`, because its 「本次检索」 section is per-turn state that lives there;
 * that pulls this file into the client bundle, which for two static blocks is the
 * cheaper side of the trade.
 *
 * Four of its sections are **slots** — `retrieval`, `profile`, `series` and
 * `library` — because all four are client-rendered state that lives in
 * `Workspace`. Passing them in keeps this file free of `"use client"`, so the
 * capability and knowledge lines stay in the server component where they belong.
 */

export function AgentIdentity({ agent }: { agent: AgentConfig }) {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-24">
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

        <ul className="mt-6 flex flex-wrap gap-2">
          {agent.capabilities.map((capability) => (
            <li key={capability} className="rounded-[var(--radius-sm)] bg-surface-alt px-2 py-1 text-micro text-ink-muted">
              {capability}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-micro font-medium text-ink-subtle">{label}</h3>
      <div className="mt-1 text-small text-ink-muted">{children}</div>
    </div>
  );
}

/**
 * The right rail. Sections with nothing in them are omitted rather than shown
 * empty — a "工具：无" line is noise that makes the product look unfinished. The
 * condition is on the value rather than hardcoded, which is what let this file
 * stay untouched as `tools` went from empty everywhere, to three agents, to all
 * ten. The workflow section below is where it still earns its keep.
 *
 * `retrieval` is a slot: the panel below it is client-rendered because what was
 * retrieved is per-turn state.
 */
export function AgentFacts({
  agent,
  retrieval,
  profile,
  series,
  library,
}: {
  agent: AgentConfig;
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
          and the last section can never be read. Four sections was already close
          to the viewport at 800px; 我的记录 makes it the normal case rather than
          the edge case, so it is fixed here rather than after the first report.

          The focus ring is the known cost: `outline-offset: 2px` is clipped at a
          scroll container's edge, so a control flush against the left or right
          edge loses a pixel of its ring while focused. Padding the container
          would fix it and would also shift every section's left edge away from
          the headings above, so the offsets stay and the ring stays slightly
          clipped — it is a focus ring that is 2px short, not a missing one. */}
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-6 overflow-y-auto">
        <Fact label="能做什么">{agent.capabilities.join(" · ")}</Fact>

        <Fact label="知识库">
          {agent.knowledgeBase === null
            ? "未接入"
            : `已接入 ${agent.knowledgeBase} 的知识库，打开对话时按需下载`}
        </Fact>

        {/* `tools` holds ids, so the label has to be looked up — joining the
            array directly would print slugs like "food-tef". The controls live
            in the centre column; this line only describes the agent. */}
        {agent.tools.length > 0 ? (
          <Fact label="工具">{agent.tools.map((id) => TOOL_DEFINITIONS[id].label).join(" · ")}</Fact>
        ) : null}

        {/* The same rule as `tools` directly above, which this line broke: the
            array holds ids, so joining it prints 「工作流：office-meeting-summary」.
            `Record<WorkflowId, WorkflowDefinition>` is total, so there is no
            unresolvable case to fall back from.

            An agent with no workflow renders nothing at all rather than saying
            so — the rule this file already states for its other sections. Six
            of the ten have none, and 「暂不支持」 on six cards would read as an
            unfinished product rather than as ten different specialisms. */}
        {agent.workflows.length > 0 ? (
          <Fact label="工作流">{agent.workflows.map((id) => WORKFLOW_DEFINITIONS[id].label).join(" · ")}</Fact>
        ) : null}

        {/* Not a `Fact`: it is the one section here the user operates rather
            than reads. It sits with the describing sections anyway, because
            that is what it is — standing facts about the user, alongside what
            the agent can do and what it knows (03_UI_UX_SPEC.md §5). The
            collapsible controls are all in the centre column; this is not one
            of them. */}
        {profile}

        {/* 我的记录 sits between the profile and the 资料夹, and the order is the
            request's: the owner asked for the curve, and it is the nearer relative
            of the two. Both are standing durable data the user authored, so both
            are in the profile *block* of the prompt — `seriesEntries` inserts the
            summaries between the declared fields and 补充说明, which is to say
            above the whole reference block, and this is that same sequence read
            top to bottom. The rail's order and the block's order are one decision
            stated twice, so changing either means changing both. */}
        {series}

        {/* The 资料夹 sits beside the profile for the same reason the profile sits
            here at all: both are standing material the user opted to carry,
            against `retrieval` below, which is what happened on this turn.

            The order is the reference block's order, not a preference. Within
            that block the folder is numbered ahead of the knowledge base
            (`lib/rag/context.ts`), so the rail reads in the sequence the citations
            do. The profile is not in that sequence — it is its own block, ahead of
            the whole reference block — which is why it is above both. */}
        {library}

        {retrieval}
      </div>
    </aside>
  );
}
