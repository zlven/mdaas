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
 * Two of its sections are **slots** — `retrieval` and `profile` — because both
 * are client-rendered state that lives in `Workspace`. Passing them in keeps this
 * file free of `"use client"`, so the capability and knowledge lines stay in the
 * server component where they belong.
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
 * empty — `tools` is `[]` for every agent in the MVP, and a "工具：无" line is
 * noise that makes the product look unfinished. The condition is on the value,
 * not hardcoded, so the first agent that does take tools gets the section.
 *
 * `retrieval` is a slot: the panel below it is client-rendered because what was
 * retrieved is per-turn state.
 */
export function AgentFacts({
  agent,
  retrieval,
  profile,
}: {
  agent: AgentConfig;
  retrieval: React.ReactNode;
  profile: React.ReactNode;
}) {
  return (
    <aside className="hidden w-72 shrink-0 lg:block">
      <div className="sticky top-24 space-y-6">
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
            of the nine have none, and 「暂不支持」 on six cards would read as an
            unfinished product rather than as nine different specialisms. */}
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

        {retrieval}
      </div>
    </aside>
  );
}
