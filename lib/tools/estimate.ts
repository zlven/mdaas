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
 * A duration a person would say out loud: 「45 秒」/「1 分 45 秒」.
 *
 * Seconds are rounded before the split, so 59.6 s becomes 「1 分 0 秒」 rather
 * than 「0 分 60 秒」.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} 秒`;

  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} 分` : `${minutes} 分 ${rest} 秒`;
}
