/**
 * The agent registry — docs/02_TECH_SPEC.md §5
 *
 * This file is an array and a lookup. Nothing else. Adding agent #10 means
 * adding one `configs/<id>.ts` file plus one import and one array entry here —
 * no changes in `app/`, `lib/llm/`, or `lib/rag/`. That is acceptance C4, and it
 * is the single best proxy for whether this is actually configuration-driven or
 * merely claims to be.
 *
 * In particular: no runtime code may branch on a specific agent id. If
 * `id === 'creator'` appears anywhere outside `configs/`, the design has been
 * violated.
 */

import { PROMPTS } from "@/lib/generated/prompts";
import { PROFILE_NOTES_KEY } from "@/lib/agents/profile";
import type { AgentConfig } from "@/lib/agents/types";

import { career } from "@/lib/agents/configs/career";
import { creator } from "@/lib/agents/configs/creator";
import { finance } from "@/lib/agents/configs/finance";
import { fitness } from "@/lib/agents/configs/fitness";
import { mental } from "@/lib/agents/configs/mental";
import { office } from "@/lib/agents/configs/office";
import { parenting } from "@/lib/agents/configs/parenting";
import { study } from "@/lib/agents/configs/study";
import { style } from "@/lib/agents/configs/style";

/**
 * Display order. The four original agents come first and the five added later
 * follow, which is also the order their knowledge bases were written in. It is
 * presentation only — `enabled` is what decides whether a card is openable, and
 * the grid deliberately does not re-sort on it (see `AgentGrid`).
 */
const AGENTS: AgentConfig[] = [
  office,
  creator,
  fitness,
  study,
  mental,
  finance,
  style,
  career,
  parenting,
];

/**
 * Validates the registry at module load.
 *
 * A misconfigured agent is a bug that would otherwise show up as a blank card
 * or a 404 on the knowledge index, so it fails loudly and immediately instead.
 * Throwing here breaks the page on purpose.
 */
function validate(agents: AgentConfig[]): void {
  const seen = new Set<string>();

  for (const agent of agents) {
    if (seen.has(agent.id)) {
      throw new Error(`registry: duplicate agent id "${agent.id}"`);
    }
    seen.add(agent.id);

    if (!/^[a-z][a-z0-9-]*$/.test(agent.id)) {
      throw new Error(
        `registry: agent id "${agent.id}" must be a lowercase slug — it is used as the knowledge/ directory name and the URL segment`,
      );
    }

    // A profile key is a storage key. Two fields sharing one would render two
    // inputs writing the same value, and the user would watch the first one
    // change as they typed into the second. Neither case is reachable by the
    // type system — `key` is a plain string — so unlike tools, this one is
    // worth a runtime check.
    const keys = new Set<string>();
    for (const field of agent.profile ?? []) {
      if (field.key === PROFILE_NOTES_KEY) {
        throw new Error(
          `registry: "${agent.id}" declares a profile field with the reserved key "${PROFILE_NOTES_KEY}" — every agent already carries that key as the free-text 补充说明 (lib/agents/profile.ts)`,
        );
      }
      if (keys.has(field.key)) {
        throw new Error(`registry: "${agent.id}" declares the profile key "${field.key}" twice`);
      }
      keys.add(field.key);
    }

    if (agent.enabled) {
      // The knowledge directory is named after the id, and the browser fetches
      // /knowledge/<id>.json by that name. A mismatch is a silent 404.
      if (agent.knowledgeBase !== agent.id) {
        throw new Error(
          `registry: "${agent.id}" is enabled but knowledgeBase is ${JSON.stringify(agent.knowledgeBase)} — it must equal the id`,
        );
      }

      const prompt = (PROMPTS as Record<string, string | undefined>)[agent.id];
      if (typeof prompt !== "string" || prompt.trim() === "") {
        throw new Error(
          `registry: "${agent.id}" is enabled but has no prompt — add prompts/${agent.id}.md`,
        );
      }
    } else {
      // docs/04_AGENT_SPEC.md §4.4: a disabled agent gets no prompt and no
      // knowledge directory. Half-configuring one is how unreviewed safety
      // obligations get shipped.
      if (agent.knowledgeBase !== null) {
        throw new Error(
          `registry: "${agent.id}" is disabled but declares knowledgeBase ${JSON.stringify(agent.knowledgeBase)} — disabled agents carry none`,
        );
      }
    }
  }
}

validate(AGENTS);

/** Every agent, including the ones that are not yet implemented. */
export function listAgents(): AgentConfig[] {
  return AGENTS;
}

/** Returns undefined for an unknown id, so callers can render a not-found state. */
export function getAgent(id: string): AgentConfig | undefined {
  return AGENTS.find((agent) => agent.id === id);
}
