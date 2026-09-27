"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { formatYuan, parseAmount, parseOptionalAmount } from "@/lib/tools/estimate";

/**
 * 应急储备金 — docs/04_AGENT_SPEC.md §7
 *
 * 「要存多少钱」 is easy once you know the monthly figure, and the monthly figure
 * is the hard part — so the tool asks for it rather than estimating it. It also
 * asks how many months, and does **not** default to the familiar 3–6 个月 rule.
 *
 * That is deliberate. 「三到六个月」 is a rule of thumb whose right value depends
 * on job stability, how many incomes the household has and where the money sits,
 * and it is exactly the sort of figure the agent should qualify in conversation
 * rather than a number a calculator prints as if it were derived. §7 calls these
 * drifting constants: the tool would be asserting something it cannot source
 * from this person's situation.
 *
 * **已有存款 is asked for.** The plan for this tool listed three inputs and would
 * have answered 「一共要存 24 个月」 for someone who has already saved half of it.
 * Nobody starts at zero, and a countdown that ignores what they have is a
 * countdown they will not use.
 */

export default function EmergencyFund({ onSend, ready, busy }: ToolProps) {
  const [spend, setSpend] = useState("");
  const [months, setMonths] = useState("");
  const [saved, setSaved] = useState("");
  const [monthly, setMonthly] = useState("");

  const monthlySpend = parseAmount(spend);
  const targetMonths = parseAmount(months);
  // Blank means nothing saved yet, which is the honest reading of an empty box
  // here — and the one field where zero is a real answer rather than a shortcut.
  const alreadySaved = parseOptionalAmount(saved);
  const monthlySave = parseAmount(monthly);

  // All four parsed at once so they narrow together, and so the three "> 0"
  // gates live in one place: a zero target or a zero monthly saving has no
  // answer, and `remaining / 0` is not a number anyone can act on.
  const fields =
    monthlySpend !== null &&
    targetMonths !== null &&
    alreadySaved !== null &&
    monthlySave !== null &&
    monthlySpend > 0 &&
    targetMonths > 0 &&
    monthlySave > 0
      ? { monthlySpend, targetMonths, alreadySaved, monthlySave }
      : null;

  const target = fields === null ? 0 : fields.monthlySpend * fields.targetMonths;
  const remaining = fields === null ? 0 : Math.max(0, target - fields.alreadySaved);
  // Rounded up: 「11.2 个月」 is really 12, and rounding down is the direction that
  // makes someone think they are closer than they are.
  const monthsToGo = fields === null ? 0 : Math.ceil(remaining / fields.monthlySave);
  const done = fields !== null && remaining === 0;

  const result =
    fields === null
      ? null
      : `我家每月必要支出大约 ${fields.monthlySpend} 元，想存够 ${fields.targetMonths} 个月的应急储备金，` +
        `也就是 ${formatYuan(target)} 元；现在已经存了 ${fields.alreadySaved} 元，还差 ${formatYuan(remaining)} 元。` +
        `按每月能存下 ${fields.monthlySave} 元算，还要 ${monthsToGo} 个月。` +
        `帮我想想这个目标合不合理，怎么安排能更快存到。`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="emergency-fund-spend" label="每月必要支出" unit="元" value={spend} onChange={setSpend} />
        <NumberField id="emergency-fund-months" label="想存够几个月" unit="个月" value={months} onChange={setMonths} />
        <NumberField id="emergency-fund-saved" label="已经存了" unit="元" value={saved} onChange={setSaved} />
        <NumberField id="emergency-fund-monthly" label="每月能存下" unit="元" value={monthly} onChange={setMonthly} />
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {fields === null ? (
            <p className="text-small text-ink-subtle">填上每月支出和想存几个月，算出目标金额和还要存多久。</p>
          ) : done ? (
            <>
              <p className="text-micro text-ink-subtle">目标 {formatYuan(target)} 元</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">已经存够</p>
            </>
          ) : (
            <>
              <p className="text-micro text-ink-subtle">按每月存 {formatYuan(fields.monthlySave)} 元，还要</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {monthsToGo}
                <span className="ml-1 text-small font-normal text-ink-muted">个月</span>
              </p>
              <p className="mt-1 text-small text-ink-muted">
                目标 <span className="tabular-nums">{formatYuan(target)}</span> 元，还差{" "}
                <span className="tabular-nums">{formatYuan(remaining)}</span> 元。
              </p>
            </>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          只做乘除。要存几个月由你自己定——它取决于工作稳定程度、家里有几份收入、钱放在哪，没有统一答案。
          已经存了的没填按 0 算。
        </p>
      </div>

      <ResultSend result={result} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
