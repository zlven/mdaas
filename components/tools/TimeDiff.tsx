"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { FIELD, LABEL } from "@/components/ui/field";
import { formatDate, formatClock, localToday, parseClock, parseDate } from "@/lib/tools/dates";
import { parseAmount } from "@/lib/tools/estimate";
import { CITIES, arrivalOf, cityLabel, formatDifference } from "@/lib/tools/timezone";

/**
 * 时差换算 — docs/04_AGENT_SPEC.md §7
 *
 * The question every long flight raises and nobody can answer in their head:
 * 「当地时间几点落地」. It is not departure plus flight time, because the clock
 * moved while you were in the air — and how far it moved depends on the date,
 * since most of the destinations below shift their clocks twice a year.
 *
 * **Nothing here knows a UTC offset.** The city list carries IANA zone ids and
 * the runtime's `Intl` data answers what the offset is *at the instant being
 * asked about*, which is the only way this stays right when a country changes
 * its rules — and the only way it gets DST right without us maintaining a
 * calendar. See `lib/tools/timezone.ts`, which has no offset written down.
 *
 * **The difference is read at the landing instant, not the departure one.** That
 * is the comparison a traveller actually makes on arrival, and it is the reading
 * that stays correct when a transition happens mid-flight.
 */

/** 「纽约 比 北京 快 12 小时」 — the sentence, not the bare number. */
function differenceSentence(from: string, to: string, minutes: number): string {
  const fromLabel = cityLabel(from);
  const toLabel = cityLabel(to);
  return minutes === 0 ? `${toLabel} 和 ${fromLabel} 没有时差` : `${toLabel} 比 ${fromLabel} ${formatDifference(minutes)}`;
}

export default function TimeDiff({ onSend, ready, busy }: ToolProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(() => formatDate(localToday(new Date())));
  const [at, setAt] = useState("");
  const [hours, setHours] = useState("");

  const departDate = parseDate(date);
  const departAt = parseClock(at);
  const flightHours = parseAmount(hours);

  const fields =
    from !== "" && to !== "" && departDate !== null && departAt !== null && flightHours !== null
      ? { departDate, departAt, flightMinutes: Math.round(flightHours * 60) }
      : null;

  // Same city on both sides is a legitimate thing to ask — it answers 「飞过去
  // 落地是几点」 for a domestic flight, where the answer is not the departure
  // time plus the flight time by any means.
  const flight = fields === null ? null : arrivalOf({ from, to, ...fields });

  const result =
    flight === null || fields === null
      ? null
      : `我 ${formatDate(fields.departDate)} ${formatClock(fields.departAt)} 从${cityLabel(from)}出发，飞 ${flightHours} 小时到${cityLabel(to)}。` +
        `落地时当地是 ${formatDate(flight.arrival.date)} ${formatClock(flight.arrival.at)}，` +
        `出发地这时是 ${formatDate(flight.arrivalAtHome.date)} ${formatClock(flight.arrivalAtHome.at)}。` +
        `${differenceSentence(from, to, flight.difference)}。帮我想想落地当天怎么安排比较合适。`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="time-diff-from" className={LABEL}>
            出发城市
          </label>
          <select id="time-diff-from" value={from} onChange={(event) => setFrom(event.target.value)} className={FIELD}>
            <option value="">选择城市</option>
            {CITIES.map((city) => (
              <option key={city.zone} value={city.zone}>
                {city.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="time-diff-to" className={LABEL}>
            到达城市
          </label>
          <select id="time-diff-to" value={to} onChange={(event) => setTo(event.target.value)} className={FIELD}>
            <option value="">选择城市</option>
            {CITIES.map((city) => (
              <option key={city.zone} value={city.zone}>
                {city.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="time-diff-date" className={LABEL}>
            出发日期
          </label>
          <input id="time-diff-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD} />
        </div>
        <div>
          <label htmlFor="time-diff-at" className={LABEL}>
            出发时间（当地）
          </label>
          <input id="time-diff-at" type="time" value={at} onChange={(event) => setAt(event.target.value)} className={FIELD} />
        </div>
        <NumberField id="time-diff-hours" label="飞行时长" unit="小时" value={hours} onChange={setHours} />
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {flight !== null && fields !== null ? (
            <>
              <p className="text-micro text-ink-subtle">{cityLabel(to)}落地时间</p>
              {/* The date leads when the flight crosses into another day, which
                  is most long-haul flights — 「10:00 落地」 without it reads as
                  the same day you left. */}
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {formatDate(flight.arrival.date)} {formatClock(flight.arrival.at)}
              </p>
              <p className="mt-1 text-small text-ink-muted">
                出发地这时是 {formatDate(flight.arrivalAtHome.date)} {formatClock(flight.arrivalAtHome.at)}。
                {differenceSentence(from, to, flight.difference)}。
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">选好两地、填上出发时间和飞行时长，算出落地时当地几点。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          按各城市的当地时间换算，夏令时按出发当天的实际规定，所以同一条航线在冬天和夏天差一小时是正常的。
          不含值机、中转和滑行时间，按你填的飞行时长直接算。
        </p>
      </div>

      <ResultSend result={result} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
