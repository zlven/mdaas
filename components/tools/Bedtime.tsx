"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { FIELD, LABEL } from "@/components/ui/field";
import { formatClock, parseClock, shiftClock } from "@/lib/tools/dates";
import { parseAmount, parseOptionalAmount } from "@/lib/tools/estimate";

/**
 * 就寝时间 — docs/04_AGENT_SPEC.md §7
 *
 * 「想 11 点睡，11 点才去洗漱」 is the whole problem this solves: the time to get
 * into bed is not the time you want to be asleep, and the gap is the thing
 * nobody counts.
 *
 * **How long to sleep is asked for, never assumed.** 「成年人需要 7–9 小时」 is a
 * health claim, `prompts/mental.md` is deliberately not a clinical instrument,
 * and the right number varies by person and by age. The tool does arithmetic on
 * a duration the user chose; it does not have an opinion about the duration.
 *
 * The countdown crosses midnight in the ordinary case — 07:00 minus eight hours
 * is the previous evening — which is why `shiftClock` wraps rather than returning
 * a negative time, and why the answer says which side of midnight it landed on.
 */

export default function Bedtime({ onSend, ready, busy }: ToolProps) {
  const [wake, setWake] = useState("");
  const [hours, setHours] = useState("");
  const [buffer, setBuffer] = useState("");

  const wakeAt = parseClock(wake);
  const sleepHours = parseAmount(hours);
  // Blank means you fall asleep as soon as your head lands, which is the honest
  // reading of an empty box — and typing 0 to say "no buffer" is friction.
  const settling = parseOptionalAmount(buffer);

  const fields =
    wakeAt !== null && sleepHours !== null && settling !== null && sleepHours > 0
      ? { wakeAt, sleepHours, settling }
      : null;

  const asleepFor = fields === null ? 0 : Math.round(fields.sleepHours * 60) + fields.settling;
  const bedtime = fields === null ? 0 : shiftClock(fields.wakeAt, -asleepFor);
  // Whether the countdown crossed midnight. `shiftClock` wraps, so this is the
  // only way to know which evening the answer belongs to, and 「22:40 上床」 means
  // something different when tonight is already over.
  const previousEvening = fields !== null && fields.wakeAt - asleepFor < 0;

  const result =
    fields === null
      ? null
      : `我打算 ${formatClock(fields.wakeAt)} 起床，想睡够 ${fields.sleepHours} 小时，躺下后大概 ${fields.settling} 分钟才睡着。` +
        `倒推下来应该 ${formatClock(bedtime)} 上床（${previousEvening ? "前一天晚上" : "当天晚上"}）。` +
        `帮我想想怎么才能按这个点睡下。`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="bedtime-wake" className={LABEL}>
            几点起床
          </label>
          {/* `type="time"` submits `HH:MM`, which is exactly what `parseClock`
              reads — no format for the user to guess at. */}
          <input id="bedtime-wake" type="time" value={wake} onChange={(event) => setWake(event.target.value)} className={FIELD} />
        </div>
        <NumberField id="bedtime-hours" label="想睡够" unit="小时" value={hours} onChange={setHours} />
        <NumberField id="bedtime-buffer" label="躺下到睡着" unit="分钟" value={buffer} onChange={setBuffer} />
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {fields !== null ? (
            <>
              <p className="text-micro text-ink-subtle">按 {formatClock(fields.wakeAt)} 起床倒推，该在</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">{formatClock(bedtime)}</p>
              <p className="mt-1 text-small text-ink-muted">
                上床（{previousEvening ? "前一天晚上" : "当天晚上"}）。睡够{" "}
                <span className="tabular-nums">{fields.sleepHours}</span> 小时，留了{" "}
                <span className="tabular-nums">{fields.settling}</span> 分钟入睡。
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">填上起床时间和想睡多久，倒推今晚该几点上床。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          只做时间倒推，不替你定睡多久——「躺下到睡着」没填按 0 算。作息长期紊乱、或者睡够时间也缓不过来，那不在一个小工具的范围内，建议问医生。
        </p>
      </div>

      <ResultSend result={result} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
