import { memo } from "react";

import { buildChart, type ChartBox } from "@/lib/series/chart";
import { formatValue } from "@/lib/series/format";
import type { Series } from "@/lib/series/types";

/**
 * One series as a line chart — docs/03_UI_UX_SPEC.md §5
 *
 * Presentational, and it decides nothing: every coordinate comes from
 * `lib/series/chart.ts`, which is pure and tested from Node. This file turns
 * numbers into elements and picks class names, which is the whole of the split —
 * the same one the tools make between their arithmetic and their panel.
 *
 * **The caption is a requirement, not decoration.** The product already owns a
 * set of rules for presenting a number — `knowledge/office/data-analysis.md` names
 * 标题, 单位, 时间范围, 数据来源, and requires a truncated y-axis to be
 * 「明确标注」 — and a chart in the rail is a number being presented. So every
 * chart carries the series name, the unit, the date range, the count, the
 * truncation statement when the axis does not start at zero, and where the data
 * came from. The `aria-label` is the same sentence, so a screen reader is told
 * what the picture says rather than that a picture exists.
 *
 * **What this component must never draw.** It draws the points the user entered
 * and the geometry needed to place them — and nothing the product computed about
 * their meaning. No target line, no healthy band, no average or trend, no
 * direction-dependent colour, no delta chip, no projection, no BMI. Four separate
 * prompt boundaries depend on that: `fitness` carries `health-edu`, whose §5
 * forbids promised outcomes and diagnosis, and a normal-range band implies both;
 * `parenting` refuses to measure a child; `finance` gives no verdict; and `mental`
 * is the sharpest, because its score is *emotional intensity*, so a chart that
 * coloured a rise green would be wrong in the direction that carries a safety
 * consequence. `--success`, `--warning` and `--danger` do not appear here, and
 * `--accent` does not either — §2 confines it to the primary action and to a
 * control's active state, and a chart line is neither. The line is drawn in
 * `--ink`, the rules in `--line`, the labels in `--ink-subtle`, all of which
 * already flip with the theme.
 *
 * **No `<svg>` for an empty series.** `buildChart` returns `kind: "empty"` and
 * this returns `null`. Empty axes would be a picture of a chart that does not
 * exist, which is a different and false statement from the panel's 「还没有记录」.
 */

/**
 * The rail's content width, in the SVG's own user units.
 *
 * 232 is the rail column's inner width, so at the primary layout the chart draws
 * at 1:1 and `text-micro` renders at exactly the 12px it means everywhere else.
 * The bottom padding of 12 is sized for exactly that label, which is not a
 * coincidence — the box and the type scale were chosen together.
 */
export const CHART_BOX: ChartBox = {
  width: 232,
  height: 64,
  padding: { top: 6, right: 4, bottom: 12, left: 30 },
};

function SeriesChartView({ series, basis }: { series: Series; basis?: string }) {
  const box = CHART_BOX;
  const geometry = buildChart(series.points, box);
  if (geometry.kind === "empty") return null;

  const left = box.padding.left;
  const right = box.width - box.padding.right;
  const top = box.padding.top;
  const bottom = box.height - box.padding.bottom;

  const points = series.points;
  const first = points[0]!.date;
  const last = points[points.length - 1]!.date;

  // A one-point series has no span to state. 「2026-03-05 至 2026-03-05」 is
  // technically true and reads as a fault; the single date carries the same fact.
  // The same decision `seriesSummary` makes for the injected sentence.
  const span = points.length === 1 ? first : `${first} 至 ${last}`;

  const meta = [series.unit === "" ? null : `单位：${series.unit}`, span, `共 ${points.length} 条`]
    .filter((part): part is string => part !== null)
    .join(" · ");

  // Only when the drawn range excludes zero. `buildChart` decides, and it is false
  // for a `dot` — a one-point series draws no axis, so there is no truncation to
  // disclose.
  const truncation = !geometry.truncated
    ? null
    : geometry.yMin > 0
      ? `纵轴自 ${formatValue(geometry.yMin)} 起，不从 0 开始`
      : `纵轴到 ${formatValue(geometry.yMax)} 止，不含 0`;

  const source = "来源：你自己在这个浏览器里的记录";
  const caption = [series.name, meta, truncation, source, basis ? `口径：${basis}` : null]
    .filter((part): part is string => part !== null && part !== "")
    .join("；");

  const polyline = geometry.points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <figure className="mt-2">
      {/* Not a heading element: the rail's `<h3>` is the panel's, and a second
          heading level inside it for every series would put five entries in the
          document outline for one panel. */}
      <figcaption className="text-small font-medium text-ink">{series.name}</figcaption>

      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        // The cap is load-bearing: an uncapped `w-full` in the strip's wider
        // column would scale the tick labels up with the box.
        className="mt-1 w-full max-w-[280px]"
        role="img"
        aria-label={caption}
      >
        {/* The two rules that make the axes readable, drawn for everything that
            has a scale. A `dot` chart has none — one point with a y-axis whose
            min and max are the same value misrepresents scale more than no axis
            does, because it looks like a scale. */}
        {geometry.kind === "dot" ? null : (
          <>
            <line x1={left} y1={top} x2={left} y2={bottom} className="stroke-line" strokeWidth={1} />
            <line x1={left} y1={bottom} x2={right} y2={bottom} className="stroke-line" strokeWidth={1} />
          </>
        )}

        {geometry.kind === "line" ? (
          <polyline
            points={polyline}
            fill="none"
            className="stroke-ink"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {/* A constant series is a level line, not a flat line at zero. `flat` has
            no span to divide by, which is why `buildChart` gives it its own kind
            rather than routing it through the scale arithmetic. */}
        {geometry.kind === "flat" ? (
          <line
            x1={left}
            y1={geometry.points[0]!.y}
            x2={right}
            y2={geometry.points[0]!.y}
            className="stroke-ink"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ) : null}

        {/* Above `DOT_LIMIT` the dots go. A dot means "a measurement was taken
            here"; at 365 points across 198 units they merge into a ribbon that
            says nothing and hides the line underneath. The line still shows every
            value — only the markers are dropped. */}
        {geometry.kind !== "dot" && geometry.showDots
          ? geometry.points.map((point, index) => (
              <circle key={`${point.x}-${index}`} cx={point.x} cy={point.y} r={2} className="fill-ink" />
            ))
          : null}

        {/* One point: the dot, and its value as text. There is no axis under it
            to read the value off, so the number has to be printed. */}
        {geometry.kind === "dot" ? (
          <>
            <circle cx={geometry.points[0]!.x} cy={geometry.points[0]!.y} r={2.5} className="fill-ink" />
            <text
              x={geometry.points[0]!.x}
              y={geometry.points[0]!.y - 6}
              textAnchor="middle"
              className="fill-ink text-micro tabular-nums"
            >
              {formatValue(geometry.yMin)}
            </text>
          </>
        ) : null}

        {geometry.yTicks.map((tick) => (
          <text
            key={`y-${tick.at}-${tick.label}`}
            x={left - 4}
            y={tick.at}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-ink-subtle text-micro tabular-nums"
          >
            {tick.label}
          </text>
        ))}

        {geometry.xTicks.map((tick) => (
          <text
            key={`x-${tick.at}-${tick.label}`}
            x={tick.at}
            y={box.height - 2}
            textAnchor={tick.anchor}
            className="fill-ink-subtle text-micro tabular-nums"
          >
            {tick.label}
          </text>
        ))}
      </svg>

      {/* Plain ungrouped digits, no currency symbol — the tools' rule for anything
          the user typed. `toLocaleString` is banned here for the same reason it is
          banned there: its output depends on the runtime's ICU data, so the same
          number would render differently on two machines. */}
      <p className="mt-1 text-micro text-ink-subtle">{meta}</p>
      {truncation === null ? null : <p className="text-micro text-ink-subtle">{truncation}</p>}
      <p className="text-micro text-ink-subtle">{source}</p>
      {basis === undefined || basis === "" ? null : (
        <p className="text-micro text-ink-subtle">口径：{basis}</p>
      )}
    </figure>
  );
}

/**
 * Memoised, and the comparison is cheap enough to be reliable: `series` is an
 * element of the store's frozen array, so its identity changes only when a
 * mutation commits, and `basis` is a string.
 *
 * **This is what keeps a keystroke out of the chart.** The panel subscribes to
 * the entry form as well as to the record, because the chart draws the *selected*
 * series and the selection lives in the draft — so typing a value re-renders the
 * panel. Without this, every character typed in the note box would re-run
 * `buildChart` and reconcile a couple of dozen SVG nodes. The store's own claim
 * that a keystroke re-renders only the form is about `Workspace`, which does not
 * subscribe at all; within the panel, this is the other half of it.
 */
export const SeriesChart = memo(SeriesChartView);
