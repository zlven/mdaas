/**
 * 我的记录 limits and the two pure predicates over them —
 * docs/04_AGENT_SPEC.md §9
 *
 * Pure: no DOM, no IndexedDB, no React. Same rule as `lib/files/limits.ts` and
 * for the same reason — every refusal below is exercised from Node
 * (`scripts/verify-series.mts`), which is where the off-by-one at a ceiling
 * actually gets caught.
 */

import type { Series } from "@/lib/series/types";

/**
 * How many series one agent's 我的记录 holds.
 *
 * Mirrors `MAX_LIBRARY_DOCUMENTS`, and it is a **cost** control before it is a UI
 * one: each series carries a standing per-message summary, so the ceiling has to
 * be low enough to reason about in tokens. Five series at the 200-character
 * budget is 1,000 characters on every turn, which is a number a person can hold
 * in their head — and `MAX_SERIES_PER_AGENT * SERIES_SUMMARY_MAX_CHARS` is
 * literally the worst case the panel's cost line reports.
 *
 * The refusal is a normal state, not an error: the add control stays visible and
 * explains itself (`lib/llm/errors.ts` `SERIES_FULL`).
 */
export const MAX_SERIES_PER_AGENT = 5;

/**
 * How many points one series holds — one per day for a year.
 *
 * A year is the horizon the feature is for: 「长期的可视化」 means a weight or a
 * mood tracked across seasons, and a curve that reaches back further than a year
 * is being read for a different question than the one this panel answers.
 *
 * Not a storage limit — 365 points is a few kilobytes — but a **chart** limit.
 * Past roughly this many points the x-axis has more positions than it has pixels,
 * which is why `DOT_LIMIT` suppresses the per-point dots far earlier. The
 * ceiling exists so the number of points has a bound the panel can state.
 */
export const MAX_POINTS_PER_SERIES = 365;

/**
 * The character budget for one series' injected summary.
 *
 * Measured with `countChars` (non-whitespace), so it means the same thing here as
 * it does for the 资料夹 and for a knowledge chunk.
 *
 * **It is a budget with a defined degradation, not a truncation.** When the
 * summary does not fit, `seriesSummary` drops the least important parts in a
 * fixed order and *says which it dropped* — the same posture as an upload whose
 * overflow goes into the retrieval pool. Cutting a summary mid-sentence would
 * hand the model a sentence that looks complete and is not.
 */
export const SERIES_SUMMARY_MAX_CHARS = 200;

/**
 * The largest number a point may hold.
 *
 * One trillion, chosen to be far above any real measurement and far below the
 * point where JavaScript's number formatting turns to exponent notation
 * (`1e21`). A stored value of `1e30` would render as `1e+30` in a tick label and
 * in the prompt, which is a number nobody can act on and which the chart's axis
 * arithmetic would not survive either.
 */
export const MAX_SERIES_VALUE = 1e12;

/** Name length cap. Long enough for 「每周投递份数」 and then some. */
export const MAX_SERIES_NAME_CHARS = 24;

/** Unit length cap. `kg`, `分`, `元`, `%` — and the occasional 「次/周」. */
export const MAX_SERIES_UNIT_CHARS = 8;

/**
 * Note length cap.
 *
 * Not in the original design and added deliberately: `note` is the one free-text
 * field in the record, and a free-text field inside a persisted, validated record
 * with no bound is how a store acquires a record it can never accept back.
 * 200 characters holds a sentence of context, which is what a note is for.
 */
export const MAX_SERIES_NOTE_CHARS = 200;

/* ============================================================================
   Normalisation — what the panel calls before it stores anything
   ========================================================================= */

/**
 * Collapses runs of whitespace, trims, and rejects empty or over-long.
 *
 * **Newlines are collapsed rather than refused**, which is the `formatProfile`
 * posture: the value is made safe on the way in, and a stored record containing
 * one is a separate, later failure (`isUsableSeriesRecord`). Refusing at the
 * input would mean a paste that happens to end in a newline reads as a validation
 * error about a name that is, to the user, perfectly fine.
 *
 * `null` means "not usable", and the caller words the message — the store and
 * this file word nothing (`lib/llm/errors.ts` owns every user-facing string).
 */
export function normalizeSeriesName(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text === "" || text.length > MAX_SERIES_NAME_CHARS) return null;
  return text;
}

/** The same rule for a unit, with its own cap. Blank is valid — units are optional. */
export function normalizeSeriesUnit(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length > MAX_SERIES_UNIT_CHARS) return null;
  return text;
}

/**
 * The same rule for a note, with its own cap. Blank is valid and is the common case.
 *
 * No newline collapsing beyond what `\s+` does: a note is stored and rendered,
 * never injected, so the reason a name has to be one line does not apply. It is
 * still normalised so the cap is measured against something stable.
 */
export function normalizeSeriesNote(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length > MAX_SERIES_NOTE_CHARS) return null;
  return text;
}

/* ============================================================================
   The two refusals
   ========================================================================= */

/**
 * The result of asking whether one more series may be started.
 *
 * A discriminated union rather than a boolean, because the two refusals are
 * different sentences and the panel has to print the right one. `existingName` is
 * carried out rather than looked up again by the caller — the message has to name
 * the series that is already there, and a second lookup is a second chance to
 * name a different one.
 */
export type SeriesRefusal =
  | { ok: true }
  | { ok: false; reason: "full"; limit: number }
  | { ok: false; reason: "duplicate-metric"; existingName: string };

/**
 * Whether one more series may be added.
 *
 * Two rules, and the second is the one worth stating: **a suggestion may only be
 * taken once.** Tapping 体重 twice would otherwise produce two series with the
 * same name and the same unit, drawing two different curves under one label, and
 * the user has no way to tell which one the agent is being told about. The
 * suggestion row already shows what has been taken, so this is the store
 * enforcing a rule the UI also demonstrates rather than a check the UI relies on.
 *
 * A user-created series passes `metricKey: null` and can never collide this way.
 *
 * Takes the list, not a count, so a caller cannot pass a number that disagrees
 * with the list it is about — the `canAddDocument` rule.
 */
export function canAddSeries(
  series: readonly Series[],
  metricKey: string | null,
): SeriesRefusal {
  if (metricKey !== null) {
    const existing = series.find((entry) => entry.metricKey === metricKey);
    if (existing) return { ok: false, reason: "duplicate-metric", existingName: existing.name };
  }

  if (series.length < MAX_SERIES_PER_AGENT) return { ok: true };
  return { ok: false, reason: "full", limit: MAX_SERIES_PER_AGENT };
}

/**
 * Whether a point may be logged against `date`.
 *
 * **A date already in the series is always permitted, including at the ceiling.**
 * That is the whole shape of the rule: the ceiling bounds how much history a
 * series holds, and correcting today's entry does not add any. Refusing it would
 * mean a full series could be created but never fixed — the user's last
 * mistyped value would be permanent, which is a worse outcome than the ceiling
 * exists to prevent.
 */
export function canAddPoint(
  series: Series,
  date: string,
): { ok: true } | { ok: false; limit: number } {
  if (series.points.some((point) => point.date === date)) return { ok: true };
  if (series.points.length < MAX_POINTS_PER_SERIES) return { ok: true };
  return { ok: false, limit: MAX_POINTS_PER_SERIES };
}
