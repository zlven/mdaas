"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { formatYuan, parseAmount } from "@/lib/tools/estimate";

/**
 * 单次穿着成本 — docs/04_AGENT_SPEC.md §7
 *
 * The number that settles 「这么贵值得吗」. A 1200 元 外套 worn twice a week for
 * three winters costs less per wear than a 300 元 one worn four times, and the
 * price tag cannot tell you that.
 *
 * **It encodes no constant at all** — no assumed lifespan, no cost-per-wear
 * threshold to stay under, no 「一件衣服该穿 30 次」. Both numbers come from the
 * user, and the arithmetic is one division. That is the cleanest possible answer
 * to §7's rule against drifting figures, and it is why 「预计穿多少次」 is asked
 * for twice rather than derived: how long a garment lasts is a fact about the
 * garment and the person, not about us.
 *
 * One decimal, unlike the other money tools. The interesting difference here is
 * between 2.5 元 and 3.1 元, and rounding both to whole yuan would erase the
 * comparison the tool exists to make.
 */

interface Garment {
  price: string;
  wears: string;
}

const EMPTY: Garment = { price: "", wears: "" };

function perWearOf(garment: Garment): number | null {
  const price = parseAmount(garment.price);
  const wears = parseAmount(garment.wears);
  if (price === null || wears === null || wears <= 0) return null;
  return price / wears;
}

function GarmentFields({ name, garment, onChange }: { name: string; garment: Garment; onChange: (next: Garment) => void }) {
  const set = (key: keyof Garment) => (next: string) => onChange({ ...garment, [key]: next });

  return (
    <div className="space-y-3">
      <p className="text-small font-medium text-ink">{name}</p>
      <NumberField id={`cost-per-wear-${name}-price`} label="价格" unit="元" value={garment.price} onChange={set("price")} />
      <NumberField id={`cost-per-wear-${name}-wears`} label="预计会穿" unit="次" value={garment.wears} onChange={set("wears")} />
    </div>
  );
}

export default function CostPerWear({ onSend, ready, busy }: ToolProps) {
  const [a, setA] = useState<Garment>(EMPTY);
  const [b, setB] = useState<Garment>(EMPTY);

  const perA = perWearOf(a);
  const perB = perWearOf(b);
  const complete = perA !== null && perB !== null;
  const difference = complete ? perB - perA : 0;

  const result =
    complete && perA !== null && perB !== null
      ? `我想比较两件的单次穿着成本。\n` +
        `A：${a.price} 元，预计穿 ${a.wears} 次，每次约 ${formatYuan(perA, 1)} 元。\n` +
        `B：${b.price} 元，预计穿 ${b.wears} 次，每次约 ${formatYuan(perB, 1)} 元。\n` +
        `${difference === 0 ? "两件每次成本一样。" : `A 每次比 B ${difference > 0 ? "便宜" : "贵"} ${formatYuan(Math.abs(difference), 1)} 元。`}` +
        `帮我想想该买哪件。`
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <GarmentFields name="A" garment={a} onChange={setA} />
        <GarmentFields name="B" garment={b} onChange={setB} />
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {complete && perA !== null && perB !== null ? (
            <>
              <p className="text-micro text-ink-subtle">A 每次穿的成本约</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {formatYuan(perA, 1)}
                <span className="ml-1 text-small font-normal text-ink-muted">元</span>
              </p>
              <p className="mt-1 text-small text-ink-muted">
                B 每次约 <span className="tabular-nums">{formatYuan(perB, 1)}</span> 元。
                {difference === 0
                  ? "两件一样。"
                  : `A 每次比 B ${difference > 0 ? "便宜" : "贵"} ${formatYuan(Math.abs(difference), 1)} 元。`}
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">两件都填上价格和预计穿的次数，才算得出每次成本。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          就是价格除以次数，没有别的假设。穿多少次由你自己估——估得越保守，结果越接近实际。不含洗护和修补。
        </p>
      </div>

      <ResultSend result={result} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
