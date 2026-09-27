import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentIdentity } from "@/components/agent/AgentRails";
import { Workspace } from "@/components/chat/Workspace";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getAgent, listAgents } from "@/lib/agents/registry";
import { tintOf } from "@/components/agent/tint";

/**
 * One agent's workspace — docs/01_PRD.md §3.3, docs/03_UI_UX_SPEC.md §5.
 *
 * `output: 'export'` means every route is a file on disk, so the id list has to
 * be known at build time. `generateStaticParams` is what makes the ten
 * workspaces exist at all; without it the directory route builds nothing and
 * every card links to a 404.
 */

export function generateStaticParams(): { id: string }[] {
  return listAgents().map((agent) => ({ id: agent.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const agent = getAgent(id);
  return { title: agent ? agent.nameZh : "未知专家" };
}

/**
 * A disabled agent gets a page rather than a 404.
 *
 * The card is not a link, so nobody arrives here by clicking; they arrive from a
 * shared URL or a search result. Showing what the agent will be is a better
 * answer than "not found", and §3.3 is explicit that the state renders **no input
 * box** — an input that cannot send is the "looks broken" failure §6 warns about.
 */
function ComingSoon({ agent }: { agent: NonNullable<ReturnType<typeof getAgent>> }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <span
        aria-hidden="true"
        className="icon-plate flex size-12 items-center justify-center rounded-[var(--radius)] text-h2"
        style={{ "--tint": tintOf(agent) } as React.CSSProperties}
      >
        {agent.icon}
      </span>

      <h1 className="mt-6 text-h1 font-semibold text-ink">{agent.nameZh}</h1>
      <p className="mt-1 text-small text-ink-muted">
        {agent.name} · <span className="text-ink-subtle">AI 智能体</span>
      </p>

      <p className="mt-6 text-body text-ink-muted">{agent.description}</p>
      <p className="mt-6 text-body text-ink-muted">这位专家还在开发中。</p>

      <Link href="/agents/" className="mt-8 inline-block text-small text-ink-muted underline underline-offset-2">
        看看其他专家
      </Link>
    </main>
  );
}

export default async function AgentWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);

  // Every id is prerendered, so this only fires for a URL that was never
  // generated — a typo, or an agent that was removed.
  if (!agent) notFound();

  if (!agent.enabled) {
    return (
      <>
        <SiteHeader />
        <ComingSoon agent={agent} />
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex max-w-[1440px] gap-8 px-6 py-10">
        <AgentIdentity agent={agent} />
        <Workspace agent={agent} />
      </main>

      <SiteFooter />
    </>
  );
}
