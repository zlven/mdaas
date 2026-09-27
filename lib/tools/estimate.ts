/**
 * The arithmetic the instant tools share — docs/04_AGENT_SPEC.md §7
 *
 * Pure functions, no React, so the parts most likely to be wrong are separable
 * from the parts that are merely markup.
 *
 * These are estimates and the UI says so. None of them is a measurement, and
 * none of the constants below is a fact about a provider or an API — they are
 * arithmetic on numbers the user typed. That distinction is what keeps them out
 * of scope for the rule against inventing drifting external details.
 */

/**
 * Reads a number the user typed. Blank or unparseable is `null`, not zero.
 *
 * The difference matters: an empty field means "not answered", while `0g` of fat
 * is an answer. Collapsing both to zero would compute a result for a form nobody
 * filled in.
 *
 * Negative values are rejected rather than clamped — there is no such thing as
 * minus 10 grams of protein, and silently treating it as 0 would produce a
 * confident number from an obviously wrong input.
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Like `parseAmount`, but **blank means zero** rather than "not answered".
 *
 * For the fields where zero is the real default and there is no third state:
 * 年终奖 on an offer with no bonus, the 入睡缓冲 on a night you drop off
 * immediately. Making someone type `0` into four boxes to say "none" is the
 * kind of friction that decides whether a tool gets used at all.
 *
 * Text that is neither blank nor a number is still `null`. Blank and invalid are
 * different, and only blank gets the benefit of the doubt — a field reading
 * 「3ooo」 must not quietly become zero and produce a confident wrong total.
 */
export function parseOptionalAmount(text: string): number | null {
  if (text.trim() === "") return 0;
  return parseAmount(text);
}

/**
 * A duration a person would say out loud: 「45 秒」/「1 分 45 秒」.
 *
 * Seconds are rounded before the split, so 59.6 s becomes 「1 分」 rather than
 * 「0 分 60 秒」.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} 秒`;

  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} 分` : `${minutes} 分 ${rest} 秒`;
}

/**
 * A yuan amount as the panel prints it: no symbol, no thousands separator.
 *
 * `toLocaleString` is what everyone reaches for first and it is the wrong tool
 * here, for a reason that is easy to miss: its output depends on the runtime's
 * ICU data, so the same number renders as `1,200` in one browser and `1200` in
 * another — and `03_UI_UX_SPEC.md` §5 fixes the form as plain digits. `toFixed`
 * is deterministic everywhere and is what the spec describes.
 *
 * It matters more than it looks. 应急储备金 and offer 折算 both print five- and
 * six-digit numbers, and ungrouped digits are genuinely harder to read; the
 * right way to change that is to change the spec rule, not to put one tool's
 * `toLocaleString` next to another tool's digits.
 *
 * `decimals` exists for 单次穿着成本, where the interesting difference is between
 * 2.5 元 and 3.1 元 and rounding both to whole yuan would erase it.
 *
 * The caller must pass a finite number — the tools guard their inputs and only
 * format a complete result, and `NaN` reaching the screen reads as the bug it is
 * rather than as a plausible zero.
 */
export function formatYuan(amount: number, decimals = 0): string {
  return amount.toFixed(decimals);
}
