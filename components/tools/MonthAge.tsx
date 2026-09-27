"use client";

import { useState } from "react";

import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { FIELD, LABEL } from "@/components/ui/field";
import { compareDates, formatDate, localToday, monthAge, parseDate } from "@/lib/tools/dates";

/**
 * 月龄计算 — docs/04_AGENT_SPEC.md §7
 *
 * 几岁几个月零几天, exactly — which sounds like subtraction and is not. From
 * 2024-01-31 to 2024-02-29 the naive version says 「0 个月 29 天」 because 29 < 31,
 * and a parent reading that about a one-month-old gets the wrong month. The
 * convention that gets it right is the one every monthly anniversary already
 * uses, and it lives in `lib/tools/dates.ts` with the tests that pin it.
 *
 * **It computes an age and stops there.** `knowledge/parenting/各年龄段发展特点.md`
 * closes by saying its own descriptions cannot be used to judge whether a child
 * is behind — that needs the whole picture and a professional assessment. A tool
 * that turned a date into a developmental verdict would be doing exactly the
 * thing our own reference material refuses, so the basis line below repeats the
 * refusal rather than implying a judgement is available. It is also why there is
 * no 纠正月龄 field: preterm follow-up is clinical territory this knowledge base
 * does not cover.
 */

export default function MonthAge({ onSend, ready, busy }: ToolProps) {
  const [birth, setBirth] = useState("");
  const [asOf, setAsOf] = useState(() => formatDate(localToday(new Date())));

  const birthDate = parseDate(birth);
  const at = parseDate(asOf);
  // `days` is negative when the birth date is ahead of the reference date, and
  // that is a real answer — 「you typed a future date」 — not a clamped zero.
  const age = birthDate !== null && at !== null && compareDates(birthDate, at) <= 0 ? monthAge(birthDate, at) : null;

  const years = age === null ? 0 : Math.floor(age.months / 12);
  const months = age === null ? 0 : age.months % 12;

  const result =
    age === null || birthDate === null || at === null
      ? null
      : `孩子出生日期是 ${formatDate(birthDate)}，到今天 ${formatDate(at)} ` +
        `是 ${age.months} 个月零 ${age.days} 天（也就是 ${years} 岁 ${months} 个月）。` +
        `帮我想想这个年龄该注意什么。`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="month-age-birth" className={LABEL}>
            出生日期
          </label>
          <input id="month-age-birth" type="date" value={birth} onChange={(event) => setBirth(event.target.value)} className={FIELD} />
        </div>
        <div>
          <label htmlFor="month-age-as-of" className={LABEL}>
            算到哪天
          </label>
          <input id="month-age-as-of" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={FIELD} />
        </div>
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {age !== null ? (
            <>
              <p className="text-micro text-ink-subtle">精确月龄</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {age.months}
                <span className="ml-1 text-small font-normal text-ink-muted">个月零 {age.days} 天</span>
              </p>
              <p className="mt-1 text-small text-ink-muted">
                也就是 <span className="tabular-nums">{years}</span> 岁 <span className="tabular-nums">{months}</span> 个月。
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">
              {birthDate !== null && at !== null && compareDates(birthDate, at) > 0
                ? "出生日期在「算到哪天」之后，这两个日期是不是填反了？"
                : "填上出生日期，算出精确的几岁几个月零几天。"}
            </p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          只做日期换算，不判断发育是否达标。是不是落后要看孩子的整体情况和发展过程，属于专业评估的范围，不是一张日期表能回答的。
        </p>
      </div>

      <ResultSend result={result} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
