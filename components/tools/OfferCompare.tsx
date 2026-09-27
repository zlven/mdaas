"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { parseAmount, parseOptionalAmount, formatYuan } from "@/lib/tools/estimate";

/**
 * offer 折算 — docs/04_AGENT_SPEC.md §7
 *
 * 「哪个 offer 划算」 is a comparison between two numbers that are not written in
 * the same unit. One offer is 13 薪 and no bonus, the other is 12 薪 with a
 * 年终奖 and a 餐补; comparing the headline monthly figures answers a different
 * question than the one being asked.
 *
 * **It does no market lookup and names no benchmark.** `prompts/career.md` §六
 * forbids the agent from quoting a market rate for this person, and a tool that
 * quietly supplied one would be routing around its own agent's boundary — the
 * 「不编造会过期的信息」 rule, applied to salary. The user supplies both offers;
 * the tool only makes them comparable.
 */

interface Offer {
  monthly: string;
  months: string;
  bonus: string;
  allowance: string;
}

const EMPTY: Offer = { monthly: "", months: "", bonus: "", allowance: "" };

/** Everything but the two fields that define the offer itself. */
function totalOf(offer: Offer): number | null {
  const monthly = parseAmount(offer.monthly);
  const months = parseAmount(offer.months);
  // Blank 年终奖 or 补贴 is genuinely zero — there is no third state — but a typo
  // is not blank, and either one being unreadable makes the total meaningless.
  const bonus = parseOptionalAmount(offer.bonus);
  const allowance = parseOptionalAmount(offer.allowance);
  if (monthly === null || months === null || bonus === null || allowance === null) return null;
  return monthly * months + bonus + allowance;
}

function OfferFields({ name, offer, onChange }: { name: string; offer: Offer; onChange: (next: Offer) => void }) {
  const set = (key: keyof Offer) => (next: string) => onChange({ ...offer, [key]: next });

  return (
    <div className="space-y-3">
      <p className="text-small font-medium text-ink">{name}</p>
      <NumberField id={`offer-${name}-monthly`} label="月薪" unit="元" value={offer.monthly} onChange={set("monthly")} />
      <NumberField id={`offer-${name}-months`} label="一年发" unit="个月" value={offer.months} onChange={set("months")} />
      <NumberField id={`offer-${name}-bonus`} label="年终奖" unit="元" value={offer.bonus} onChange={set("bonus")} />
      <NumberField id={`offer-${name}-allowance`} label="一年补贴" unit="元" value={offer.allowance} onChange={set("allowance")} />
    </div>
  );
}

export default function OfferCompare({ onSend, ready, busy }: ToolProps) {
  const [a, setA] = useState<Offer>(EMPTY);
  const [b, setB] = useState<Offer>(EMPTY);

  const totalA = totalOf(a);
  const totalB = totalOf(b);
  const complete = totalA !== null && totalB !== null;
  const difference = complete ? totalA - totalB : 0;

  const result =
    complete && totalA !== null && totalB !== null
      ? `我手上有两个 offer，想比较一下年总包。\n` +
        `A：月薪 ${a.monthly} 元 × ${a.months} 个月，年终奖 ${a.bonus || 0} 元，补贴 ${a.allowance || 0} 元，折合一年 ${formatYuan(totalA)} 元。\n` +
        `B：月薪 ${b.monthly} 元 × ${b.months} 个月，年终奖 ${b.bonus || 0} 元，补贴 ${b.allowance || 0} 元，折合一年 ${formatYuan(totalB)} 元。\n` +
        `A 比 B ${difference >= 0 ? "多" : "少"} ${formatYuan(Math.abs(difference))} 元。` +
        `帮我想想除了钱还该看什么，怎么选。`
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <OfferFields name="A" offer={a} onChange={setA} />
        <OfferFields name="B" offer={b} onChange={setB} />
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {complete && totalA !== null && totalB !== null ? (
            <>
              {/* The comparison leads, not the two totals. Two six-digit numbers
                  side by side is the input restated; the difference is the
                  answer, and §5's ungrouped digits make it the only part that
                  reads at a glance. */}
              <p className="text-micro text-ink-subtle">A 比 B</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {difference >= 0 ? "多" : "少"} {formatYuan(Math.abs(difference))}
                <span className="ml-1 text-small font-normal text-ink-muted">元</span>
              </p>
              <p className="mt-1 text-small text-ink-muted">
                A 一年 <span className="tabular-nums">{formatYuan(totalA)}</span> 元，B 一年{" "}
                <span className="tabular-nums">{formatYuan(totalB)}</span> 元。
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">两边都填上月薪和发薪月数，才算得出年总包。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          只做折算：月薪 × 发薪月数 + 年终奖 + 补贴。年终奖和补贴没填的按 0 算。税前口径，不含五险一金、公积金比例和股权，
          也不比较两地的房租与生活成本。
        </p>
      </div>

      <ResultSend result={result} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
