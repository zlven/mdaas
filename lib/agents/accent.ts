/**
 * The per-agent accent — docs/03_UI_UX_SPEC.md §2.
 *
 * **One screen belongs to one agent, so the accent on that screen is that
 * agent's colour.** That is the same rule as 「一屏只有一个强调色」 stated from the
 * other end, and it is why this is a two-line function rather than a theme: the
 * colour does not spread anywhere new. It lands exactly where §2 already allowed
 * colour — the primary action, the active state, the focus ring — and nowhere
 * else. The icon plate (`--tint`, `app/globals.css`) is the third place, and the
 * landing page, which shows ten agents side by side, sets none of this and stays
 * monochrome on purpose.
 *
 * Returned as CSS custom properties rather than as a class, because that is what
 * makes the mechanism small: Tailwind v4 compiles `bg-accent` to
 * `background-color: var(--color-accent)`, custom properties inherit down the
 * DOM, and the nearest declaration wins. So one `style` on the page's `<main>`
 * re-colours every `bg-accent` / `text-accent` / `border-accent` beneath it —
 * including the hand-written `:focus-visible` rule in `globals.css`, which reads
 * the same variable — and **not one component has to know about agents**.
 * (Verified against the built CSS, not assumed: `out/_next/static/chunks/*.css`
 * contains `var(--color-accent)`, never an inlined hex.)
 *
 * **Both properties, always.** This is the trap worth naming. A custom property
 * whose value contains `var()` — and `--color-accent-hover` is one — is
 * substituted *where it is declared*, so the `:root` value is already a fixed
 * colour by the time a subtree inherits it. Overriding only `--color-accent`
 * therefore leaves a per-agent button that turns teal the moment it is hovered.
 * Both are emitted here, and `verify:theme` asserts it.
 */

/**
 * `amount` of black mixed into an sRGB colour — the same arithmetic as
 * `color-mix(in srgb, <hex> <1-amount>%, black)`, done in JS because this has to
 * be a value the style attribute can carry.
 *
 * sRGB is the right space for this and not a shortcut: the goal is a hover state
 * that reads as the same colour, pressed. Mixing in a perceptual space would
 * shift the hue, which is precisely what a hover state must not do.
 */
function mixBlack(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map((c) =>
      Math.round(c * (1 - amount))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * The default accent pair's own step, measured rather than guessed:
 * `#2f5d62` → `#26494d` is a 21.5% mix toward black. Using the same number for
 * every agent means a per-agent button presses with exactly the weight the
 * global one does.
 *
 * The plan for this work said 14%. 14% is not wrong — it still drops luminance
 * by 0.0345 and leaves white text at 7.23:1 — but the shipped default's step is
 * a measurement and the plan's was an estimate, so the measurement wins.
 */
const HOVER_MIX = 0.215;

export type AgentAccent = {
  "--color-accent": string;
  "--color-accent-hover": string;
};

/**
 * `tint` is the agent's declared colour (`AgentConfig.tint`), already validated
 * by the registry to be a 7-character hex that clears 4.5:1 behind white text.
 * This function adds no checks of its own: the registry fails the build on a bad
 * tint, and duplicating the rule here would only give it a second place to drift.
 */
export function agentAccent(tint: string): AgentAccent {
  return {
    "--color-accent": tint,
    "--color-accent-hover": mixBlack(tint, HOVER_MIX),
  };
}
