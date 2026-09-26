import type { AgentConfig } from "@/lib/agents/types";

/**
 * The per-agent icon hue — docs/03_UI_UX_SPEC.md §2, §4.
 *
 * Derived from the id so nothing has to be configured per agent (C4). A tiny
 * deterministic string hash, not a cryptographic one: the only requirement is
 * that it is stable across renders, builds, and reloads, so the card and the
 * workspace show the same hue for the same agent.
 *
 * `--tint` is consumed by `.icon-plate` in `app/globals.css`, which owns the
 * saturation and lightness. Only the hue is decided here.
 */
export function tintOf(agent: Pick<AgentConfig, "id">): number {
  let hash = 0;
  for (let i = 0; i < agent.id.length; i++) {
    hash = (hash * 31 + agent.id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}
