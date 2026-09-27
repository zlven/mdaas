"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { FIELD, LABEL } from "@/components/ui/field";
import { formatDate, localToday, parseDate } from "@/lib/tools/dates";
import { parseAmount } from "@/lib/tools/estimate";
import { wordPlan } from "@/lib/tools/word-plan";

/**
 * 背单词计划 — docs/04_AGENT_SPEC.md §7
 *
 * Answers the question 「每天 30 个，要背到哪天」 — and then the one nobody asks:
 * which day the reviews pile up. Everyone plans the new words and nobody plans
 * the day the first batch, the second batch and the week-ago batch all come due
 * together, which is why the schedule looks fine for a week and then stops.
 *
 * The arithmetic is in `lib/tools/word-plan.ts` rather than here. Not tidiness:
 * the peak and the trailing review tail are emergent over a rolling window, and
 * a reader cannot check them by eye — which is the test `lib/tools/estimate.ts`
 * sets for extracting something.
 *
 * **The start date defaults to today**, which is the one place a tool reads the
 * clock. That is safe here because `ToolPanel` renders a tool only after a click
 * (`components/tools/ToolPanel.tsx`), so nothing below ever runs during the
 * static export — `new Date()` cannot be baked into the HTML. It is still a
 * `useState` initialiser, so it is read once on mount and not on every keystroke.
 */

export default function WordPlan({ onSend, ready, busy }: ToolProps) {
  const [total, setTotal] = useState("");
  const [perDay, setPerDay] = useState("");
  const [start, setStart] = useState(() => formatDate(localToday(new Date())));

  const vocabulary = parseAmount(total);
  const daily = parseAmount(perDay);
  const from = parseDate(start);

  // Grouped so the three parsed inputs narrow together. Narrowing `plan` alone
  // does not tell the compiler that `from` is non-null, and a `!` to bridge that
  // gap is a claim the code cannot back up.
  const fields = vocabulary !== null && daily !== null && from !== null ? { vocabulary, daily, from } : null;
  const plan = fields === null ? null : wordPlan({ total: fields.vocabulary, perDay: fields.daily, start: fields.from });

  const result =
    plan === null || fields === null
      ? null
      : `我打算背 ${fields.vocabulary} 个词，每天新词 ${fields.daily} 个，从 ${formatDate(fields.from)} 开始。` +
        `按复习计划排下来要 ${plan.learnDays} 天，${formatDate(plan.finish)} 背完最后一批，${formatDate(plan.lastReview)} 复习收尾。` +
        `最重的一天是第 ${plan.peak.day} 天，共 ${plan.peak.fresh + plan.peak.review} 个（新词 ${plan.peak.fresh} + 复习 ${plan.peak.review}）` +
        `${plan.sustainedPeak ? `，而且从第 ${plan.peak.day} 天到第 ${plan.learnDays} 天都是这个量` : "，只有这一天"}。` +
        `帮我看看这个计划合不合理，要不要调整。`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField id="word-plan-total" label="词汇总量" unit="词" value={total} onChange={setTotal} />
        <NumberField id="word-plan-per-day" label="每天新词" unit="个" value={perDay} onChange={setPerDay} />
        <div>
          <label htmlFor="word-plan-start" className={LABEL}>
            开始日期
          </label>
          {/* `type="date"` rather than a text field: the value it submits is
              already `YYYY-MM-DD`, which is what `parseDate` reads, and it is a
              date the user picks instead of a format they have to guess. */}
          <input
            id="word-plan-start"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {plan !== null ? (
            <>
              <p className="text-micro text-ink-subtle">背完最后一批要</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {plan.learnDays}
                <span className="ml-1 text-small font-normal text-ink-muted">天</span>
              </p>
              <p className="mt-1 text-small text-ink-muted">
                {formatDate(plan.finish)} 背完，{formatDate(plan.lastReview)} 复习收尾。
              </p>
              <p className="mt-1 text-small text-ink-muted">
                最重的一天是第 <span className="tabular-nums">{plan.peak.day}</span> 天，共{" "}
                <span className="tabular-nums">{plan.peak.fresh + plan.peak.review}</span> 个（新词{" "}
                <span className="tabular-nums">{plan.peak.fresh}</span> + 复习{" "}
                <span className="tabular-nums">{plan.peak.review}</span>）。
                {/* The honest half of the peak. It is normally a plateau, not a
                    spike, and 「最重的一天是第 8 天」 on its own would imply the
                    other days are lighter when they are the same size. */}
                {plan.sustainedPeak ? `从第 ${plan.peak.day} 天起一直是这个量。` : "只有这一天。"}
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">填上词汇量和每天新词，算出要背多久、哪天最重。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          估算依据：每天新词按固定数量推进，复习按「次日、第三天、一周后」各回看一次，不计当天那一遍。进度有快有慢，这是按固定节奏排的理想情况。
        </p>
      </div>

      <ResultSend result={result} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
