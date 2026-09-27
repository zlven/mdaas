import { AgentCard } from "@/components/agent/AgentCard";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * The agent matrix — docs/03_UI_UX_SPEC.md §3, §4.
 *
 * Ordering comes from `registry.ts` (docs/02_TECH_SPEC.md §5). Worth knowing
 * when editing here: the grid must not re-sort, because ordering in the view
 * would be the same decision made in two places.
 */
export function AgentGrid({ agents }: { agents: AgentConfig[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {agents.map((agent) => (
        <li key={agent.id} className="h-full">
          <AgentCard agent={agent} />
        </li>
      ))}
    </ul>
  );
}
