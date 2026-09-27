/**
 * Line-chart geometry for 我的记录 — docs/03_UI_UX_SPEC.md §5
 *
 * Pure, and in `lib/` for the same reason the tools' arithmetic is: the parts
 * that can be silently wrong are separable from the parts that are merely markup.
 * `components/series/SeriesChart.tsx` turns the numbers below into elements and
 * decides nothing.
 *
 * **It never reads the DOM, a clock, or `toLocaleString`.** The box is passed in
 * rather than measured, so the same call in Node and in a browser returns the
 * same coordinates — which is what makes the degenerate cases below testable at
 * all.
 *
 * **There is no chart library and no second colour.** `03_UI_UX_SPEC.md` §2 allows
 * one accent, for the primary action and a control's active state, and a chart
 * line is neither. The line is drawn in the text colour, the axis rule in the
 * border colour, and the tick labels in the subtle text colour — all of which
 * already flip with the theme. A data-viz palette would be a second brand colour
 * arriving through the back door.
 *
 * **Every degenerate case has a defined rendering rather than a divide-by-zero.**
 * The table is in `06_ACCEPTANCE.md` §M; the short version is that one point is
 * not a line, a constant series is not a flat line at zero, and no points is not
 * a chart with empty axes. Each of those is a case a user reaches in the first
 * five minutes of using the panel.
 */

import { formatTick, formatValue, shortDate } from "@/lib/series/format";

/**
 * Past this many points the per-point dots are suppressed.
 *
 * A dot carries the information "a measurement was taken here". At 365 points
 * across ~200 units they merge into a ribbon, which says nothing and hides the
 * line underneath. The line still shows every value; only the markers go.
 */
export const DOT_LIMIT = 40;

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartBox {
  width: number;
  height: number;
  padding: ChartPadding;
}

/** The minimum a point needs for this module. Structurally `SeriesPoint`. */
export interface ChartInput {
  date: string;
  value: number;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartTick {
  /** The pixel position, on the axis it belongs to. */
  at: number;
  label: string;
  /**
   * Where the label sits relative to `at`. Positional, and therefore geometry's
   * to decide: the first x tick has nothing to its left and the last has nothing
   * to its right, so anchoring either one in the middle would run it off the box.
   */
  anchor: "start" | "middle" | "end";
}

/**
 * How the series should be drawn.
 *
 * `flat` is not the same as `line` with a zero span: a constant series has no
 * scale to speak of, so it gets one tick at its own value and a level line,
 * rather than an axis that invents a range around it.
 */
export type ChartKind = "empty" | "dot" | "line" | "flat";

export interface ChartGeometry {
  kind: ChartKind;
  points: ChartPoint[];
  yTicks: ChartTick[];
  xTicks: ChartTick[];
  /** The data's own extremes — not the ticks'. */
  yMin: number;
  yMax: number;
  /**
   * True when the drawn range excludes zero, which the caption must say
   * (`knowledge/office/data-analysis.md`: a truncated y-axis 「需要明确标注」).
   *
   * Always false for `dot`, which draws no y-axis at all — there is no truncation
   * to disclose when there is no scale.
   */
  truncated: boolean;
  showDots: boolean;
}

/**
 * Collapses a date to a single point, last one wins, and sorts ascending.
 *
 * **The store already guarantees this shape.** Re-applying it here is what makes
 * this function total: it can be handed a hand-edited record, a mid-migration
 * array, or a fixture from a test, and it produces a drawable series rather than
 * a vertical segment between two points that share an x. A case that "cannot
 * happen" and is handled anyway can be *tested*; a case that is called impossible
 * cannot, and then nothing notices when it starts happening.
 *
 * Lexicographic sort is chronological **only because** the store normalises every
 * date through `parseDate` → `formatDate` before writing it. `2026-1-5` would
 * sort after `2026-09-27`. That dependency is stated in `lib/series/types.ts`.
 */
function collapse(points: readonly ChartInput[]): ChartInput[] {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const out: ChartInput[] = [];
  for (const point of sorted) {
    const last = out[out.length - 1];
    // `sort` is stable, so equal dates keep their input order and the last one
    // written is the last one here.
    if (last && last.date === point.date) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

/**
 * Tick values across `[min, max]`, on a round step.
 *
 * **`min === max` has no special case, and that is a decision.** The obvious
 * implementation — round `span / (target - 1)` up to a nice step — divides by a
 * zero span, and `Math.log10(0)` being `-Infinity` turns the step into `NaN` and
 * the whole axis into 64 `NaN` ticks. An earlier version of this function guarded
 * against it on the first line.
 *
 * The guard was removed, because the search below already handles it: a zero span
 * admits no step producing two ticks, every candidate is rejected, and the
 * fallback returns one tick at `min`. That is the correct answer, reached by the
 * same path as every other input. Keeping the guard as well would have been
 * harmless and *worse* — it would have been an early return no test could reach,
 * so the assertion covering this case would have been guarding code the test never
 * ran, which is the dead-check shape `CLAUDE.md` records twice.
 *
 * The returned `step` is `0` in that case, which `decimalsForStep` handles.
 */
export function niceTicks(min: number, max: number, count: number): { ticks: number[]; step: number } {
  const target = Math.max(2, count);
  const span = max - min;

  /**
   ** Candidates are tried, not computed.
   *
   * The textbook one-liner — round `span / (target - 1)` up to the next 1/2/5 —
   * picks a step that is *nice* and then discovers it fits only one multiple
   * inside the data's own range. 体重 between 60.5 and 63.1 rounds a 1.3 step up to
   * 2, and `[60.5, 63.1]` contains exactly one multiple of 2. The axis comes back
   * with a single tick, which is not a scale.
   *
   * So the step is chosen by building the ticks and looking at them: walk the
   * 1/2/5 ladder upward and take the first step whose ticks fit inside the range
   * without exceeding the target count by more than one. The search starts just
   * below `span / target`, which is where the answer always is, and runs ten
   * decades, which is far more room than any real axis needs.
   */
  const first = Math.max(-12, Math.floor(Math.log10(span / target)) - 1);
  let best: { ticks: number[]; step: number } | null = null;

  for (let exponent = first; exponent <= first + 10; exponent++) {
    for (const base of [1, 2, 5]) {
      const step = base * 10 ** exponent;
      // A step this fine cannot come in under the cap, so there is no reason to
      // build the list — which is also what keeps the walk cheap on a wide range
      // like 0 to 1e12.
      if (span / step > target + 2) continue;

      const ticks = ticksWithin(min, max, step);
      // One tick is the `min === max` rendering, not an axis. Keep looking.
      if (ticks.length < 2) continue;

      if (best === null) best = { ticks, step };
      // The ladder is ascending, so tick counts only fall from here. The first
      // step that fits is the finest one that fits, which is the densest axis the
      // target allows.
      if (ticks.length <= target + 1) return { ticks, step };
    }
  }

  // A range narrower than the finest candidate step — an absurd input, but the
  // function is total: one tick at the lower bound is a worse axis than a round
  // one and a much better one than none.
  return best ?? { ticks: [min], step: 0 };
}

/**
 * Every multiple of `step` inside `[min, max]`.
 *
 * The loop is bounded rather than `while (value <= max)`, so a step that
 * underflows cannot spin. With the caller's pre-filter it can never be reached —
 * it is here because this is the one loop in the module that could fail by not
 * finishing, and "cannot happen" is not a reason to leave a loop unbounded.
 */
function ticksWithin(min: number, max: number, step: number): number[] {
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];

  for (let i = 0; i < 64; i++) {
    const value = start + i * step;
    // The epsilon absorbs the float error in `start`, which is a division and a
    // multiplication away from an exact multiple.
    if (value > max + step * 1e-9) break;
    ticks.push(value);
  }

  return ticks;
}

/**
 * The whole rendering decision, from points to coordinates.
 *
 * Returns `kind: "empty"` with no points and no ticks for an empty series, and the
 * component's response to that is to render **no `<svg>` at all**. Empty axes
 * would be a picture of a chart that does not exist, which is a different and
 * false statement from 「还没有记录」.
 */
export function buildChart(points: readonly ChartInput[], box: ChartBox): ChartGeometry {
  const left = box.padding.left;
  const right = box.width - box.padding.right;
  const top = box.padding.top;
  const bottom = box.height - box.padding.bottom;
  const middle = (top + bottom) / 2;

  const collapsed = collapse(points);

  if (collapsed.length === 0) {
    return {
      kind: "empty",
      points: [],
      yTicks: [],
      xTicks: [],
      yMin: 0,
      yMax: 0,
      truncated: false,
      showDots: false,
    };
  }

  const values = collapsed.map((point) => point.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const showDots = collapsed.length <= DOT_LIMIT;

  /** Evenly spaced across the plot. One point sits in the middle. */
  const xAt = (index: number): number =>
    collapsed.length === 1
      ? (left + right) / 2
      : left + (right - left) * (index / (collapsed.length - 1));

  const last = collapsed.length - 1;
  const xTicks: ChartTick[] =
    collapsed.length === 1
      ? [{ at: xAt(0), label: shortDate(collapsed[0]!.date), anchor: "middle" }]
      : [
          { at: xAt(0), label: shortDate(collapsed[0]!.date), anchor: "start" },
          { at: xAt(last), label: shortDate(collapsed[last]!.date), anchor: "end" },
        ];

  // One point is not a line. It gets a dot and its value as text, and — the part
  // that matters — **no y-axis**: an axis whose min and max are the same value
  // misrepresents scale more than no axis does, because it looks like a scale.
  if (collapsed.length === 1) {
    return {
      kind: "dot",
      points: [{ x: xAt(0), y: middle }],
      yTicks: [],
      xTicks,
      yMin,
      yMax,
      truncated: false,
      showDots: true,
    };
  }

  // No range to draw. The line is level at the middle, and there is exactly one
  // tick, at the series' own value. No invented ± band: a range the data does not
  // have is the first step toward a chart that appears to interpret.
  if (yMax === yMin) {
    return {
      kind: "flat",
      points: collapsed.map((_, index) => ({ x: xAt(index), y: middle })),
      yTicks: [{ at: middle, label: formatValue(yMin), anchor: "end" }],
      xTicks,
      yMin,
      yMax,
      // `0 === 0` includes the origin, so an all-zero series is not truncated.
      truncated: yMin > 0 || yMax < 0,
      showDots,
    };
  }

  const span = yMax - yMin;
  const yAt = (value: number): number => bottom - (bottom - top) * ((value - yMin) / span);

  const { ticks, step } = niceTicks(yMin, yMax, 3);
  const yTicks: ChartTick[] = ticks
    .filter((value) => value >= yMin && value <= yMax)
    .map((value) => ({ at: yAt(value), label: formatTick(value, step), anchor: "end" }));

  return {
    kind: "line",
    points: collapsed.map((point, index) => ({ x: xAt(index), y: yAt(point.value) })),
    yTicks,
    xTicks,
    yMin,
    yMax,
    truncated: yMin > 0 || yMax < 0,
    showDots,
  };
}
