import type { Metadata } from "next";

import { AgentGrid } from "@/components/agent/AgentGrid";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { listAgents } from "@/lib/agents/registry";

/**
 * Expert directory — docs/01_PRD.md §3.2.
 *
 * Ten cards, no filters. A filter control on a list of ten is a worse list.
 */

export const metadata: Metadata = {
  title: "AI 专家矩阵",
};

export default function AgentsPage() {
  const agents = listAgents();

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 pt-16">
        <h1 className="text-h1 font-semibold text-ink">AI 专家矩阵</h1>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          每一位专家都是 AI 智能体，各自带着自己的知识库，也只能看到自己的知识库。
        </p>

        <div className="mt-12">
          <AgentGrid agents={agents} />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
