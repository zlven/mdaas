/**
 * The palette's Node-checkable half — docs/03_UI_UX_SPEC.md §2.
 *
 * Run: npm run verify:theme
 *
 * **Why this file exists.** Every colour the product has lives in one `@theme`
 * block, and until now nothing checked any of them. That is how `--ink-subtle`
 * came to sit at 2.68:1 across 84 call sites — every rail heading, every
 * caption — while `docs/03_UI_UX_SPEC.md` §13 claimed WCAG AA. A contrast ratio
 * is a number, the number is computable from the hex, and a check that is not
 * written is a check that is not happening. This turns "we measured it once,
 * during the redesign" into "it cannot regress without a red run".
 *
 * The contract is deliberately stronger than the current usage: **every** colour
 * in the block must clear its floor, not only the ones something renders today.
 * `--warning` had no consumer at all and was 3.90:1; the point of the stronger
 * contract is that the next person to use it cannot pick up a broken colour.
 *
 * **What is deliberately NOT here.**
 *
 *   - **The values themselves.** This file asserts floors, not hexes. A test
 *     that pins `#6e6e76` would go red on any legitimate adjustment, which is
 *     the opposite of useful.
 *   - **Whether the palette looks good.** Unmeasurable here, and the reason
 *     `docs/06_ACCEPTANCE.md` J13–J15 keep a human in the loop.
 *   - **That the built CSS resolves the accent through `var()`.** The mechanism
 *     was verified by hand against `out/_next/static/chunks/*.css`; a script
 *     cannot check it without a build, and `npm run build` is already the thing
 *     that would fail. What *is* checked is the source of the mechanism — see
 *     the last section — which is the half that can silently change.
 *   - **That a tint is a well-formed hex, and that no two agents share one.**
 *     Both are `lib/agents/registry.ts`'s, which throws at module load — so a
 *     bad tint never reaches this file at all, and an assertion here would be
 *     unreachable. Confirmed by deleting each rule from the registry and
 *     watching this script die on the import instead of failing a check. What
 *     the registry cannot see is the half asserted below: two *different* hexes
 *     that are the same colour to a person.
 *
 * Every check is paired in a comment with **what to delete to make it go red**,
 * and each must go red *on that check* — an import error is also red and does
 * not count. `CLAUDE.md` records two occasions here where a check that could not
 * fail was mistaken for coverage.
 *
 * Needs a browser instead: whether the three greys are comfortable to read on a
 * real panel, whether the ten tints look like their domains, whether the ten
 * plates are tellable apart at 14%, and whether the focus ring and the send
 * button really do take the agent's colour. See `docs/06_ACCEPTANCE.md` J13–J15.
 */

import { existsSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

interface ResolveResult {
  url: string;
  shortCircuit?: boolean;
}
type NextResolve = (specifier: string, context: unknown) => ResolveResult;

/**
 * **Why this is not `import { registerHooks } from "node:module"`.** The runtime
 * is Node 22.17 and `registerHooks` landed in 22.15 — but the repo pins
 * `@types/node@^20`, which predates it. So the function exists and its type does
 * not, and the plain named import is a compile error against a program that
 * runs. One assertion, in one place, with this comment; same as the other four
 * `verify-*.mts` files.
 */
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => ResolveResult;
  }) => void;
};

const ROOT = resolvePath(process.cwd());
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolvePath(ROOT, specifier.slice(2));
      // Extension probing, because the repo writes internal imports without one
      // (`@/lib/agents/types`) and Node does not resolve that the way TS does.
      for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const accent = await import("../lib/agents/accent.ts");
const registry = await import("../lib/agents/registry.ts");
const tint = await import("../components/agent/tint.ts");

// ---------------------------------------------------------------------------
// Reading the theme — app/globals.css
//
// Parsed rather than restated. A copy of the colours in this file would be a
// second source of truth, and the two would agree right up until one changed —
// which is the failure mode this whole file exists to prevent.

const GLOBALS = readFileSync(resolvePath(ROOT, "app/globals.css"), "utf8").replace(/^﻿/, "");

/**
 * Every `--color-*: #hex;` inside the `@theme` block.
 *
 * Anchored on the `--color-` prefix, which is what keeps it off `--shadow-pop`'s
 * `rgba()` values and off every `--color-accent: var(--…)` reference: the
 * pattern requires a literal hex, so a token that has been redefined in terms of
 * another token simply does not appear.
 */
const THEME: Record<string, string> = {};
for (const match of GLOBALS.matchAll(/^\s*(--color-[a-z-]+):\s*(#[0-9a-f]{6});\s*$/gm)) {
  THEME[match[1]] = match[2];
}

// ---------------------------------------------------------------------------
// Colour arithmetic

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
function luminance(rgb: [number, number, number]): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * sRGB → CIELAB (D65). Needed because WCAG contrast answers "can this be read"
 * and says nothing about "can these be told apart" — two colours can both clear
 * 5:1 behind white and still be the same colour to a person.
 */
function toLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const [x, y, z] = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ];
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76. Crude next to CIEDE2000 and enough for "are these two the same hue". */
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

function section(name: string): void {
  console.log(`\n${name}`);
}

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** `undefined` for a missing token rather than a throw, so the check that reads
 *  it fails by name instead of the whole run dying on a non-assertion. */
const token = (name: string): string | undefined => THEME[name];

function ratio(fg: string | undefined, bg: string | undefined): string {
  if (fg === undefined || bg === undefined) return "a token is missing";
  return `${contrast(fg, bg).toFixed(2)}:1`;
}

const clears = (fg: string | undefined, bg: string | undefined, floor: number): boolean =>
  fg !== undefined && bg !== undefined && contrast(fg, bg) >= floor;

const BG = token("--color-bg");
const SURFACE = token("--color-surface");

// ---------------------------------------------------------------------------
section("The theme block — app/globals.css");

// Red if: a token is renamed or a value is written without the leading `#`, in
// which case every check below would silently pass on `undefined`. It is the
// precondition for the rest of the file, so it is asserted rather than assumed.
const REQUIRED = [
  "--color-bg",
  "--color-surface",
  "--color-surface-alt",
  "--color-line",
  "--color-line-strong",
  "--color-ink",
  "--color-ink-muted",
  "--color-ink-subtle",
  "--color-accent",
  "--color-accent-hover",
  "--color-accent-fg",
  "--color-success",
  "--color-warning",
  "--color-danger",
];
check(`every token is declared as a hex (${REQUIRED.length})`, REQUIRED.every((name) => token(name) !== undefined), REQUIRED.filter((name) => token(name) === undefined).join(", "));

// ---------------------------------------------------------------------------
section("Text contrast — WCAG AA, 4.5:1");

// Red if: `--ink-subtle` goes back to #9a9aa0 (2.68:1). That is the exact
// regression this file was written for: 84 call sites use it, including every
// rail heading, and it was below AA *and* below the 3:1 large-text floor.
//
// bg as well as surface, because text sits on both — the page background behind
// a rail's prose, a white card behind the same prose elsewhere.
for (const name of ["--color-ink", "--color-ink-muted", "--color-ink-subtle"]) {
  check(`${name} clears 4.5:1 on the page`, clears(token(name), BG, 4.5), ratio(token(name), BG));
  check(`${name} clears 4.5:1 on a card`, clears(token(name), SURFACE, 4.5), ratio(token(name), SURFACE));
}

// Red if: `--ink-muted` is left where it was while `--ink-subtle` is fixed. On
// its own, a compliant `ink-subtle` would be darker than `ink-muted` and two of
// the three steps would collapse into one — a hierarchy with two levels and
// three names. ΔE 8 is well under the 11.5 the current pair manages and well
// over the ~3 that reads as the same grey.
const INK_STEPS = ["--color-ink", "--color-ink-muted", "--color-ink-subtle"];
for (let i = 0; i < INK_STEPS.length; i++) {
  for (let j = i + 1; j < INK_STEPS.length; j++) {
    const [a, b] = [token(INK_STEPS[i]), token(INK_STEPS[j])];
    check(`${INK_STEPS[i]} and ${INK_STEPS[j]} are different greys`, a !== undefined && b !== undefined && deltaE(a, b) >= 8, a && b ? `ΔE76 ${deltaE(a, b).toFixed(1)}` : "a token is missing");
  }
}

// Red if: any status colour is lightened. `--warning` was the one that failed
// (3.90:1) and had no consumer — which is why the contract covers colours
// nothing renders yet.
for (const name of ["--color-success", "--color-warning", "--color-danger"]) {
  check(`${name} clears 4.5:1 on the page`, clears(token(name), BG, 4.5), ratio(token(name), BG));
  check(`${name} clears 4.5:1 on a card`, clears(token(name), SURFACE, 4.5), ratio(token(name), SURFACE));
}

// ---------------------------------------------------------------------------
section("Hairlines and fills — visible, not decorative");

// Red if: `--color-line` goes back to #e7e7e4 (1.24:1), which is a border that
// renders as nothing. 1.30 is the floor at which a 1px line reads as an edge on
// a normal panel; the shipped value is 1.375 and the strong variant 1.788.
for (const name of ["--color-line", "--color-line-strong"]) {
  check(`${name} is visible on a card (1.30:1)`, clears(token(name), SURFACE, 1.3), ratio(token(name), SURFACE));
}

// Red if: `--color-surface-alt` goes back to #f4f4f5 (1.10:1). This one is a
// product requirement rather than a taste: docs/01_PRD.md §5 requires the user's
// own message to be visually distinguishable from the assistant's, and the user
// bubble's only separation from the page is this fill.
check("--color-surface-alt separates from a card (1.12:1)", clears(token("--color-surface-alt"), SURFACE, 1.12), ratio(token("--color-surface-alt"), SURFACE));

// Red if: the page background is set to pure white, which erases every card on
// the site at once — the defect that started this work.
check("the page is not the card", token("--color-bg") !== token("--color-surface"), `${BG} vs ${SURFACE}`);

// ---------------------------------------------------------------------------
section("The accent");

// Red if: the default accent is lightened past the point where white text on it
// is readable — it is the send button's background everywhere that is not an
// agent's page.
check("--color-accent-fg clears 4.5:1 on --color-accent", clears(token("--color-accent-fg"), token("--color-accent"), 4.5), ratio(token("--color-accent-fg"), token("--color-accent")));

// Red if: the accent is nudged toward neutral until it stops reading as the
// actionable thing on the screen. 3:1 is the non-text floor; the shipped value
// is 6.84:1.
check("--color-accent stands off the page (3:1)", clears(token("--color-accent"), BG, 3), ratio(token("--color-accent"), BG));

// ---------------------------------------------------------------------------
section("The ten agent tints — lib/agents/configs/*.ts");

const agents = registry.listAgents();

// The well-formedness and uniqueness of a tint are the registry's — it throws at
// module load, so `agents` above could not exist otherwise. Asserting them here
// too would be a check that cannot fail; see the header.
check(`the registry yielded ${agents.length} agents, each with a distinct id`, new Set(agents.map((a) => a.id)).size === agents.length && agents.length > 0);

for (const agent of agents) {
  // Red if: a tint is lightened. White is what sits on it — the send button's
  // label, the active workflow step's marker — so this is the floor that decides
  // how dark the whole palette has to be.
  check(`${agent.id} carries white text (4.5:1)`, clears("#ffffff", agent.tint, 4.5), ratio("#ffffff", agent.tint));
  // Red if: a tint drifts toward the page colour until the button reads as a
  // disabled control rather than the primary action.
  check(`${agent.id} stands off the page (3:1)`, clears(agent.tint, BG, 3), ratio(agent.tint, BG));
}

// Red if: two tints are moved closer together — by nudging one hue, or by
// desaturating one until it slides into its neighbour.
//
// 15 is a judgement, and the honest version of it: ten hues share 360°, so 36°
// apiece, and the warm arc holds three of them. The shipped minimum is 17.4
// (`style`/`creator`), which is near the ceiling for a palette that also has to
// keep each colour recognisable as its domain. Colour is never load-bearing
// information here — every place a tint appears, the agent's name is beside it —
// which is what makes 15 defensible rather than merely convenient.
let closest: [string, string, number] | null = null;
for (let i = 0; i < agents.length; i++) {
  for (let j = i + 1; j < agents.length; j++) {
    const distance = deltaE(agents[i].tint, agents[j].tint);
    if (closest === null || distance < closest[2]) closest = [agents[i].id, agents[j].id, distance];
  }
}
check("no two tints are perceptually close (ΔE76 15)", closest !== null && closest[2] >= 15, closest ? `${closest[0]}/${closest[1]} at ${closest[2].toFixed(1)}` : "no pairs");

// ---------------------------------------------------------------------------
section("The mechanism — how a tint reaches the page");

// Red if: `tintOf` goes back to hashing the id. Asserted behaviourally on the
// real configs, which is stronger than grepping the file for `charCodeAt`: a
// hash would return a number, and a number here fails whether it was produced by
// the old loop or by anything else.
//
// This is the check that would have caught the *original* design being wrong in
// the way that mattered — the hash could not know that `finance` should not come
// out purple, and nothing in the product could have told you.
check("tintOf returns the declared value", agents.every((agent) => tint.tintOf(agent) === agent.tint));
check("tintOf is not a hash", tint.tintOf({ tint: "#abcdef" }) === "#abcdef", String(tint.tintOf({ tint: "#abcdef" })));

// Red if: `.icon-plate` is given a literal colour, at which point every agent's
// plate becomes the same one. The plate is the *only* place a tint shows on the
// landing page and the directory, so this is where the grid's colour lives.
//
// Asserted over the rule's **whole body**, and as an absence as well as a
// presence. The first draft read `/\.icon-plate\s*\{[^}]*var\(--tint\)/` and
// stayed green with the background replaced by a literal hex — the border on the
// next line still mentioned `var(--tint)`, so the pattern matched a line the
// mutation had not touched. That is the same shape as both false checks
// `CLAUDE.md` records: a marker string that already appears somewhere else in
// the text being searched, so the search succeeds whatever you delete.
// No `s` flag: `[^}]` is a negated class, so it already spans newlines, and the
// flag is a `TS1501` against this repo's `target`.
const plateRule = /\.icon-plate\s*\{([^}]*)\}/.exec(GLOBALS)?.[1];
check(
  ".icon-plate reads --tint and carries no literal colour",
  plateRule !== undefined && plateRule.includes("var(--tint)") && !plateRule.includes("#"),
  plateRule?.replace(/\s+/g, " ").trim(),
);

// Red if: the focus ring is given a literal colour. It is written by hand rather
// than compiled from a utility, so it is the one accent consumer Tailwind cannot
// be asked to keep honest — and a focus ring that stays teal on a green agent's
// page is the kind of thing nobody notices for months.
check(":focus-visible reads --color-accent", /:focus-visible\s*\{[^}]*var\(--color-accent\)/.test(GLOBALS));

// Red if: `agentAccent` stops emitting one of the two properties.
//
// **The hover is the trap.** A custom property whose value contains `var()` is
// substituted where it is *declared*, so `:root`'s `--color-accent-hover` is
// already a fixed colour by the time a subtree inherits it. Overriding only
// `--color-accent` produces a per-agent button that turns teal the moment it is
// hovered — correct on first paint, wrong on the first interaction, which is the
// hardest kind of defect to see in a screenshot.
for (const agent of agents) {
  const style = accent.agentAccent(agent.tint);
  const hover: unknown = style["--color-accent-hover"];
  // Guarded rather than fed straight into `hexToRgb`. Deleting the hover from
  // `agentAccent` used to throw `Cannot read properties of undefined` here, and
  // the run died before printing FAILURES — a red test that names no assertion,
  // which is the one thing this file must not produce.
  const wellFormed = typeof hover === "string" && /^#[0-9a-f]{6}$/.test(hover);

  check(`${agent.id}: agentAccent emits both properties`, eq(Object.keys(style).sort(), ["--color-accent", "--color-accent-hover"]), Object.keys(style).join(", "));
  check(`${agent.id}: the accent is the tint`, style["--color-accent"] === agent.tint);
  check(`${agent.id}: the hover is a valid hex`, wellFormed, String(hover));
  // Red if: the hover mix goes to zero or inverts, leaving a button that does
  // not visibly change under the pointer.
  check(`${agent.id}: the hover is darker`, wellFormed && luminance(hexToRgb(hover as string)) < luminance(hexToRgb(agent.tint)));
  // Red if: the mix pushes the hover so dark that white text on it stops
  // working — it cannot, with a mix toward black, but the assertion is what
  // makes "cannot" a fact about the file rather than about the arithmetic.
  check(`${agent.id}: white still reads on the hover (4.5:1)`, wellFormed && clears("#ffffff", hover as string, 4.5), wellFormed ? ratio("#ffffff", hover as string) : String(hover));
}

// Red if: an accent is mounted on a page that shows more than one agent. The
// landing page and the directory render ten cards side by side, and ten accents
// in one view is exactly the decoration docs/03_UI_UX_SPEC.md §1 forbids — the
// icon plate is the only colour those two pages carry.
for (const page of ["app/page.tsx", "app/agents/page.tsx"]) {
  const source = readFileSync(resolvePath(ROOT, page), "utf8");
  check(`${page} mounts no agent accent`, !source.includes("agentAccent"));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("all green");
console.log(
  "\nThis covers the palette's contrast floors, the ten tints' separability, and\n" +
    "the mechanism that puts an agent's colour on its own page.\n" +
    "What needs a browser is listed at the end of docs/06_ACCEPTANCE.md §J: J13,\n" +
    "J14 and J15 — how the greys actually read on a panel, whether the ten colours\n" +
    "look like their domains, and whether the send button and the focus ring\n" +
    "really do take the agent's colour.\n",
);
