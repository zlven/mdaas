/**
 * The record model for 我的记录 — docs/04_AGENT_SPEC.md §8, §9
 *
 * A **series** is one thing the user decided to track over time: a name, a unit,
 * and a number per date. Several of them sit under one agent, so the fourth kind
 * of per-agent state joins the other three — the profile (config-declared
 * fields), the 资料夹 (documents), and the conversation.
 *
 * Four decisions are encoded in the shape below, and each is a decision rather
 * than a convenience:
 *
 *   1. **`name` and `unit` are copied into the record, not read from the config.**
 *      A series can come from a suggestion (`metricKey`) or from the user typing
 *      their own. Once it exists it is the user's data, and the chart, the list
 *      and the prompt must keep working when the config changes underneath it —
 *      including when a suggestion is deleted outright. Reading the label live
 *      would orphan every series whose suggestion went away.
 *
 *      The 口径 note is the deliberate exception and it goes the other way: it is
 *      *our* prose about what the number means, so it is read live from the
 *      config (`MetricSuggestion.basis`) and never copied here. Fixing a wording
 *      mistake in one place has to fix it everywhere.
 *
 *   2. **`metricKey` records where it came from, and `null` means "the user made
 *      this up".** It is what stops a second series being started from a
 *      suggestion the agent already offers (`canAddSeries`), which is a UI
 *      defect rather than a data one. It is not an identity and nothing joins on
 *      it.
 *
 *   3. **`include` is the standing per-message switch**, exactly as
 *      `LibraryDocument.include` is, and for the same reason: a summary rides on
 *      every message, so the user is opting into a recurring cost once and needs
 *      a way to stop paying it without deleting the data.
 *
 *   4. **`points` is ascending by date with exactly one entry per date.** Not a
 *      log of every entry ever made — a *series*, where re-logging a date
 *      corrects it. Two points on one date would draw a vertical segment that
 *      means nothing, and the chart has no way to say which one is real.
 *
 * `summaryChars` follows `LibraryDocument.inlineChars`: a derived number stored
 * alongside the thing it describes, validated on read, so the record cannot claim
 * a cost the content does not have.
 */

/** One measurement on one day. */
export interface SeriesPoint {
  /**
   * `YYYY-MM-DD`, zero-padded and validated — whatever `parseDate` accepts,
   * normalised through `formatDate` before it is stored.
   *
   * **The normalisation is load-bearing, not tidiness.** `parseDate` accepts
   * `2026-1-5`, and `"2026-1-5" > "2026-09-27"` as a string, so an unpadded date
   * would sort after a September one. Ordering, the chart's x-axis, and the
   * "latest value" in the injected summary all compare these as strings.
   */
  date: string;
  /** Finite, non-negative, at most `MAX_SERIES_VALUE`. */
  value: number;
  /**
   * The user's optional remark. `""` is the one representation of "none".
   *
   * **Never injected.** That is a decision, not an oversight: the note is where
   * someone writes 「昨天喝多了」 or 「今天被老师叫去谈话」, which is the most
   * sensitive text this product would ever hold, and the summary has no need of
   * it. Note text is also the exact shape of the thing the injection boundary
   * exists to contain, and keeping it out of the prompt means the boundary has
   * one less surface to defend.
   */
  note: string;
}

export interface Series {
  /** Stable id: the store's React key, and what every mutation addresses. */
  id: string;
  /** What the user calls it, e.g. 体重. Copied from the suggestion or typed. */
  name: string;
  /** e.g. `kg`. May be `""` — plenty of metrics have no unit. */
  unit: string;
  /** The suggestion this came from, or `null` for a user-created series. */
  metricKey: string | null;
  /** Whether this series' summary is sent with every message. */
  include: boolean;
  /** Ascending by `date`, one entry per date. */
  points: SeriesPoint[];
  /**
   * `countChars` of `seriesSummary(this)`. Recomputed on every mutation and
   * checked on read, so a hand-edited record cannot understate what it costs.
   */
  summaryChars: number;
}

/**
 * One agent's whole 我的记录, under one key.
 *
 * **One record per agent, holding every series and every point.** The 资料夹
 * makes the same choice for the same reason: a per-series or per-point key would
 * need a cursor to enumerate, and a cursor is the primitive the isolation rule
 * forbids. Here the argument is sharper still — the record is small (five series
 * of at most 365 points is a few hundred kilobytes at the very worst, and
 * typically a few hundred bytes), so there is nothing to gain by splitting it and
 * a structural guarantee to lose.
 */
export interface SeriesRecord {
  agentId: string;
  schemaVersion: number;
  updatedAt: number;
  series: Series[];
}
