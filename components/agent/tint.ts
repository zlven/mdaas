import type { AgentConfig } from "@/lib/agents/types";

/**
 * The agent's colour, as the icon plate takes it — docs/03_UI_UX_SPEC.md §2, §4.
 *
 * **This used to hash the id into a hue.** The reason given was that deriving
 * the hue meant nothing had to be configured per agent, which was said to matter
 * for C4. It did not: the field lives in `lib/agents/configs/` too, so declaring
 * it touches exactly as much as deriving it — and the derivation could not know
 * that `finance` should not come out purple, which is the whole requirement. So
 * the hash is gone and the colour is declared (`AgentConfig.tint`).
 *
 * What the hash did buy was an even spread with no hand-picking. That is now
 * bought instead: the ten hues were solved for even spacing under a contrast
 * ceiling, and `verify:theme.mts` asserts both properties — every tint clears
 * 4.5:1 behind white text, and no two are within a perceptual distance of 15.
 * The assertion replaced the algorithm.
 *
 * This stays a named function rather than the three call sites reading
 * `agent.tint`, so that "how an agent's colour is decided" has one place to be
 * documented and one place to change.
 */
export function tintOf(agent: Pick<AgentConfig, "tint">): string {
  return agent.tint;
}
