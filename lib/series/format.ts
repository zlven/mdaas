/**
 * How a recorded number is rendered — docs/03_UI_UX_SPEC.md §5
 *
 * Small enough to look trivial, and shared deliberately: the chart's tick labels,
 * the injected summary and the panel's point list all print numbers the user
 * typed, and they have to print them the same way. Three copies of "round to six
 * decimals and stringify" is three chances for the curve to be labelled `62.5`
 * while the list under it reads `62.50`.
 *
 * **No `toLocaleString`, ever.** It is the obvious tool and it is the wrong one
 * here: its output depends on the runtime's ICU data, so the same value renders
 * as `1,200` in one browser and `1200` in another, and `03_UI_UX_SPEC.md` §5 fixes
 * the form as plain ungrouped digits. `lib/tools/estimate.ts` records the same
 * decision for the tools' yuan amounts.
 *
 * The values here are **user-owned data**, not product-owned measurements. That
 * is why there is no symbol, no separator and no fixed decimal count: `62.5` is
 * what the user typed and `62.5` is what they should read back. The product
 * formats only what the product computed.
 */

/**
 * The most decimals a recorded value is rendered with.
 *
 * Six, so a value that arrived as a float artefact (`0.30000000000000004` from a
 * paste or a future import) reads as `0.3`, while anything a person would
 * actually type survives untouched. Six is also the cap `formatTick` clamps to,
 * so a tick and a point can never disagree about how precise a number is.
 */
const MAX_DECIMALS = 6;

/** Rounds away float noise below the sixth decimal, then stringifies plainly. */
export function formatValue(value: number): string {
  // The callers guard their inputs, but a non-finite value reaching the screen
  // should read as the bug it is rather than as a plausible zero.
  if (!Number.isFinite(value)) return "—";
  const scale = 10 ** MAX_DECIMALS;
  return String(Math.round(value * scale) / scale);
}

/**
 * How many decimals a tick label needs, given the spacing between ticks.
 *
 * Derived from the step rather than from the values: an axis stepping by 0.5 must
 * print `62.5`, and one stepping by 1 must print `62` and not `62.0`. Deriving it
 * from the value instead would give a single axis two different precisions,
 * which reads as a rendering fault.
 */
export function decimalsForStep(step: number): number {
  // `step <= 0` covers the flat case, where `niceTicks` returns a step of 0 and
  // `-Math.log10(0)` is `Infinity` — which would clamp to six decimals and print
  // a tick of 「62.500000」.
  if (!(step > 0)) return 0;
  if (step >= 1) return 0;
  return Math.min(MAX_DECIMALS, Math.ceil(-Math.log10(step)));
}

/**
 * One axis tick's label. `step` is the axis's own spacing, which decides the
 * precision — see `decimalsForStep`.
 *
 * `toFixed` then back through `Number` before `formatValue`, because `toFixed(1)`
 * on `62` gives `"62.0"`. Rounding to the step's precision and then printing with
 * `formatValue` gives `62` and `62.5` from the same axis, which is what a person
 * expects to see.
 */
export function formatTick(value: number, step: number): string {
  if (!Number.isFinite(value)) return "—";
  return formatValue(Number(value.toFixed(decimalsForStep(step))));
}

/**
 * `2026-09-27` → `09-27`.
 *
 * The x-axis has room for five characters, not ten, and the year is in the
 * caption directly under the chart — so it is stated once, in the line that can
 * afford it, rather than abbreviated into every tick.
 *
 * Substring rather than a parse: the store normalises every stored date to
 * `YYYY-MM-DD`, so the first five characters are the month and day by
 * construction. A value that is not that shape loses nothing — the chart would
 * already be showing a date the store refused to hold.
 */
export function shortDate(date: string): string {
  return date.length >= 10 ? date.slice(5) : date;
}

/**
 * `2026-03-05` → `3 月 5 日` — the long form, for the one place with room.
 *
 * The 覆盖 label on the entry button is the only caller, and it is the only
 * string here that is read while the user is deciding rather than while they are
 * reading data: 「覆盖 3 月 5 日」 is a sentence, and `2026-03-05` inside it reads
 * like a field value. The year is deliberately dropped, because the date input
 * directly above the button is showing it.
 *
 * Leading zeros are dropped, which is why this is not a `slice`: 「3 月 5 日」 is
 * how a date is written and 「03 月 05 日」 is how a timestamp is.
 *
 * Total, like `shortDate`: anything that is not a well-formed `YYYY-MM-DD` comes
 * back unchanged rather than as `NaN 月 NaN 日`. The store normalises every date
 * it holds, so the guard is for a value that never came from the store.
 */
export function longDate(date: string): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || day < 1) return date;
  return `${month} 月 ${day} 日`;
}
