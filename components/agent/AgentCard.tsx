import Link from "next/link";

import { tintOf } from "@/components/agent/tint";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * An agent card — docs/03_UI_UX_SPEC.md §4, docs/01_PRD.md §4.
 *
 * "Product module, not dashboard widget": the card carries identity, what the
 * agent does, whether it works, and how to open it — and nothing else. No
 * metrics, no usage counts, no badges for the sake of badges.
 *
 * The whole card is the click target for an available agent. A `Coming Soon`
 * card is not a dimmed link — it is not a link at all, and it has no hover
 * state. The absence of the hover response is what communicates "inert"; the
 * badge alone would read as a link that happens to be greyed out.
 */

function StatusLine({ enabled }: { enabled: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-1 rounded-full ${enabled ? "bg-success" : "bg-ink-subtle"}`}
      />
      <span className={`text-micro font-medium ${enabled ? "text-ink-muted" : "text-ink-subtle"}`}>
        {enabled ? "可用" : "开发中"}
      </span>
    </span>
  );
}

function CardBody({ agent }: { agent: AgentConfig }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="icon-plate flex size-10 items-center justify-center rounded-[var(--radius)] text-h2"
        style={{ "--tint": tintOf(agent) } as React.CSSProperties}
      >
        {agent.icon}
      </span>

      <h3 className="mt-4 text-h3 font-semibold text-ink">{agent.nameZh}</h3>
      <p className="text-small text-ink-muted">{agent.name}</p>

      {/* Clamped to two lines. Capability lists differ in length, and a card
          whose tag row wraps to three lines makes the row ragged — the tag row
          is the only part of the card allowed to vary. */}
      <p className="mt-3 line-clamp-2 text-micro text-ink-muted">
        {agent.capabilities.join(" · ")}
      </p>

      {/* mt-auto pins the status and affordance to the bottom edge, so cards
          with different amounts of text still line up across a row. */}
      <div className="mt-auto flex items-center justify-between pt-6">
        <StatusLine enabled={agent.enabled} />
        {agent.enabled ? (
          <span className="flex items-center gap-1 text-small font-medium text-ink">
            打开专家
            <span aria-hidden="true" className="transition-transform duration-150 ease-out group-hover:translate-x-0.5">
              →
            </span>
          </span>
        ) : null}
      </div>
    </>
  );
}

const SHELL = "flex h-full flex-col rounded-[var(--radius)] border bg-surface p-6";

export function AgentCard({ agent }: { agent: AgentConfig }) {
  if (!agent.enabled) {
    return (
      <div className={`${SHELL} border-line opacity-60`}>
        <CardBody agent={agent} />
      </div>
    );
  }

  return (
    <Link
      href={`/agents/${agent.id}/`}
      className={`${SHELL} group border-line transition-colors duration-150 ease-out hover:border-line-strong`}
    >
      <CardBody agent={agent} />
    </Link>
  );
}
