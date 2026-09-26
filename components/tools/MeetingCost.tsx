"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { parseAmount } from "@/lib/tools/estimate";

/**
 * 会议成本 — docs/04_AGENT_SPEC.md §7
 *
 * Multiplication, and that is the whole point: the number is not hard to compute,
 * it is hard to *remember to compute*. A meeting that feels free costs its
 * attendees' hourly rate times its length times its headcount, and seeing that
 * figure is what turns "let's sync on this" into an agenda.
 *
 * The hourly rate is asked for rather than assumed. A per-industry or per-city
 * average would be an invented external fact that drifts and that we could not
 * source — and it is the input the user is most likely to have a real number for.
 */

export default function MeetingCost({ onSend, ready, busy }: ToolProps) {
  const [people, setPeople] = useState("");
  const [minutes, setMinutes] = useState("");
  const [rate, setRate] = useState("");

  const headcount = parseAmount(people);
  const length = parseAmount(minutes);
  const hourly = parseAmount(rate);

  // Every input is required here, unlike the food calculator: half a meeting cost
  // is not a smaller meeting cost, it is a different (and wrong) number.
  const complete = headcount !== null && length !== null && hourly !== null && headcount > 0 && length > 0;

  const hours = (length ?? 0) / 60;
  const total = (headcount ?? 0) * hours * (hourly ?? 0);

  const result =
    `这场会：${headcount ?? 0} 人，${length ?? 0} 分钟，参会人平均时薪按 ${hourly ?? 0} 元算，` +
    `成本大约 ${Math.round(total)} 元（每人约 ${Math.round(hours * (hourly ?? 0))} 元）。` +
    `帮我想想这场会值不值，怎么开能更省时间。`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField id="meeting-cost-people" label="参会人数" unit="人" value={people} onChange={setPeople} />
        <NumberField id="meeting-cost-minutes" label="会议时长" unit="分钟" value={minutes} onChange={setMinutes} />
        <NumberField id="meeting-cost-rate" label="平均时薪" unit="元" value={rate} onChange={setRate} />
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {complete ? (
            <>
              <p className="text-micro text-ink-subtle">这场会成本约</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {Math.round(total)}
                <span className="ml-1 text-small font-normal text-ink-muted">元</span>
              </p>
              <p className="mt-1 text-small text-ink-muted">
                每人约 <span className="tabular-nums">{Math.round(hours * (hourly ?? 0))}</span> 元。
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">三个数字都填上，成本才算得出来。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          只算参会人的时间成本，不含场地、差旅和会前准备。时薪用你自己的数字更准。
        </p>
      </div>

      <ResultSend result={complete ? result : null} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
