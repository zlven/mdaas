"use client";

import { useState } from "react";

import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { FIELD, LABEL } from "@/components/ui/field";
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

function Figure({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputId = `meeting-cost-${id}`;
  return (
    <div>
      <label htmlFor={inputId} className={LABEL}>
        {label}（{unit}）
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      />
    </div>
  );
}

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
        <Figure id="people" label="参会人数" unit="人" value={people} onChange={setPeople} />
        <Figure id="minutes" label="会议时长" unit="分钟" value={minutes} onChange={setMinutes} />
        <Figure id="rate" label="平均时薪" unit="元" value={rate} onChange={setRate} />
      </div>

      <div className="text-small" aria-live="polite">
        {complete ? (
          <p className="text-ink">
            这场会成本约 <strong className="font-semibold">{Math.round(total)}</strong> 元。
          </p>
        ) : (
          <p className="text-ink-subtle">三个数字都填上，成本才算得出来。</p>
        )}
      </div>

      <p className="text-micro text-ink-subtle">
        只算参会人的时间成本，不含场地、差旅和会前准备。时薪用你自己的数字更准。
      </p>

      <ResultSend result={complete ? result : null} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
