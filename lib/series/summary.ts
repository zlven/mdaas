/**
 * One series → the sentence that reaches the agent — docs/02_TECH_SPEC.md §8.6
 *
 * Pure, and it takes the record and nothing else. No config, no clock, no
 * `Date` — so the same series always produces the same string, which is what lets
 * `summaryChars` be a stored field that a validator can re-derive and check.
 *
 * **The summary is a restatement, never a reading.** It says how many entries
 * there are, over what span, what the extremes were, and what the last few values
 * were. It does not say whether that is good, bad, fast, slow, healthy or
 * alarming, and it does not compute anything the user did not type: no average,
 * no trend, no rate of change, no projection, no target.
 *
 * That restraint is a requirement rather than a style, for four separate reasons
 * held by four separate agents — `fitness`'s `health-edu` boundary forbids
 * implying an outcome, `parenting` refuses to measure a child, `finance` gives no
 * verdict, and `mental`'s score is *emotional intensity*, so a summary that read
 * a rise as improvement would be wrong in the direction that carries a safety
 * consequence. The judgement belongs to the agent, whose prompt carries the
 * boundary for its own domain; this module's job ends at the numbers.
 *
 * **The note is never included.** See `SeriesPoint.note` in `lib/series/types.ts`.
 */

import { countChars } from "@/lib/rag/chunk";
import { SERIES_SUMMARY_MAX_CHARS } from "@/lib/series/limits";
import { formatValue, shortDate } from "@/lib/series/format";
import type { Series, SeriesPoint } from "@/lib/series/types";

/**
 * How many recent values the summary tries to list, before the budget forces it
 * down. Five is enough to show a direction without reading as a data dump.
 */
const RECENT_TARGET = 5;

function recentClause(points: readonly SeriesPoint[], k: number): string {
  if (k <= 0) return "";
  const shown = points.slice(points.length - k).reverse();
  const list = shown.map((point) => `${formatValue(point.value)}（${shortDate(point.date)}）`).join("、");
  return `；最近 ${k} 次 ${list}`;
}

/**
 * States how many values were left out, when any were.
 *
 * **The disclosure is not optional and it is not decoration.** A summary that
 * silently lists five of three hundred entries reads as a complete account of the
 * series, and the model would then reason about the tail as if it were the whole.
 * Saying so costs eleven characters and is the same posture an upload takes when
 * its overflow goes into the retrieval pool instead of the prompt: the reader —
 * human or model — is told what they are not seeing.
 */
function omittedClause(total: number, k: number): string {
  if (k >= total) return "";
  return `（更早的 ${total - k} 条未列出）`;
}

/**
 * The summary sentence for one series, or `""` when there is nothing to say.
 *
 * **A series with no points is never injected**, and `""` is how that is
 * expressed — the caller drops empty entries, exactly as `formatProfile` drops
 * blank fields. A line reading 「体重（kg）：共 0 条」 would spend the user's tokens
 * telling the model that a thing it was never asked about does not exist.
 *
 * **The budget is spent, not truncated.** When the full sentence does not fit,
 * this drops the least load-bearing part and tries again, in a fixed order:
 *
 *   1. Shrink the recent-values list, one value at a time, down to none.
 *   2. Drop the min–max clause, then let the recent-values list grow back.
 *   3. Never drop the count or the date span.
 *
 * The order encodes a judgement: what the values *were* most recently is more
 * useful to an expert than the extremes of the whole series, and both are less
 * important than knowing how much history exists and over what period. Step 2
 * letting the list grow back is not a quirk — once the extremes are gone there is
 * room again, and a smaller summary is only better when it is also a *cheaper*
 * one.
 *
 * The count and the span always fit — `共 365 条，2026-01-01 至 2026-12-31` is well
 * under the budget — so the loop always terminates with a result and there is no
 * unreachable fallback.
 */
export function seriesSummary(series: Series): string {
  const points = series.points;
  if (points.length === 0) return "";

  const total = points.length;
  const first = points[0]!.date;
  const last = points[total - 1]!.date;

  // One point has no span to state. Writing 「2026-03-05 至 2026-03-05」 would be
  // technically true and read as a fault; the single date carries the same fact.
  const base = total === 1 ? `共 1 条，${first}` : `共 ${total} 条，${first} 至 ${last}`;

  const values = points.map((point) => point.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A constant series has no range worth stating, and 「范围 62.5 至 62.5」 reads as
  // a rendering bug rather than as a fact.
  const rangeClause = lo === hi ? "" : `；范围 ${formatValue(lo)} 至 ${formatValue(hi)}`;

  const upper = Math.min(total, RECENT_TARGET);

  for (const withRange of [true, false]) {
    const head = `${base}${withRange ? rangeClause : ""}`;
    // Descending, so the first k that fits is the largest k that fits.
    for (let k = upper; k >= 0; k--) {
      const text = `${head}${recentClause(points, k)}${omittedClause(total, k)}`;
      if (countChars(text) <= SERIES_SUMMARY_MAX_CHARS) return text;
    }
  }

  return base;
}

/**
 * `summaryChars` for a series — always derived, never counted by hand.
 *
 * A function rather than a field read, so the store recomputes it on every
 * mutation and `isUsableSeriesRecord` recomputes it on every read. Storing a
 * number that describes content is only safe when something re-derives it; the
 * alternative is a record that can claim a cost its content does not have, which
 * is the same class of bug as a `putCount` that a failed write also leaves
 * unchanged.
 */
export function seriesSummaryChars(series: Series): number {
  return countChars(seriesSummary(series));
}
