"use client";

import { useState } from "react";

import { NumberField } from "@/components/tools/NumberField";
import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { parseAmount } from "@/lib/tools/estimate";

/**
 * 食物热效应 — docs/04_AGENT_SPEC.md §7
 *
 * The point of this tool is the number people do not have: the energy a meal
 * costs to digest. Total intake from macros is arithmetic anyone can do, so it is
 * shown as context rather than as the answer.
 *
 * The percentages are the conventional textbook ranges for each macronutrient
 * (protein 20–30%, carbohydrate 5–10%, fat 0–3%), and they are rendered **as a
 * range with the inputs visible**, because a single number here would be a
 * precision this calculation does not have. The output says 估算 and the panel
 * shows where the endpoints came from.
 *
 * No external data and no provider detail, so nothing here can drift.
 */

/** Atwater factors — kcal per gram. */
const KCAL_PER_GRAM = { protein: 4, carb: 4, fat: 9 } as const;

/** Share of each macro's energy spent digesting it. */
const TEF = {
  protein: { low: 0.2, high: 0.3 },
  carb: { low: 0.05, high: 0.1 },
  fat: { low: 0, high: 0.03 },
} as const;

export default function FoodTef({ onSend, ready, busy }: ToolProps) {
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");

  const p = parseAmount(protein);
  const c = parseAmount(carb);
  const f = parseAmount(fat);

  // An empty field is "not answered" and contributes nothing, rather than
  // blocking the whole calculation — someone who only knows the protein number
  // should still get a usable answer.
  const intake = (p ?? 0) * KCAL_PER_GRAM.protein + (c ?? 0) * KCAL_PER_GRAM.carb + (f ?? 0) * KCAL_PER_GRAM.fat;
  const low = Math.round(
    (p ?? 0) * KCAL_PER_GRAM.protein * TEF.protein.low +
      (c ?? 0) * KCAL_PER_GRAM.carb * TEF.carb.low +
      (f ?? 0) * KCAL_PER_GRAM.fat * TEF.fat.low,
  );
  const high = Math.round(
    (p ?? 0) * KCAL_PER_GRAM.protein * TEF.protein.high +
      (c ?? 0) * KCAL_PER_GRAM.carb * TEF.carb.high +
      (f ?? 0) * KCAL_PER_GRAM.fat * TEF.fat.high,
  );

  const answered = p !== null || c !== null || f !== null;

  const result =
    `我这一餐大约吃了：蛋白质 ${p ?? 0} g、碳水 ${c ?? 0} g、脂肪 ${f ?? 0} g（合计约 ${Math.round(intake)} kcal）。` +
    `按食物热效应估算，消化本身要消耗大约 ${low}–${high} kcal。` +
    `帮我看看这餐的搭配，以及这个消耗量对我意味着什么。`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField id="food-tef-protein" label="蛋白质" unit="g" value={protein} onChange={setProtein} />
        <NumberField id="food-tef-carb" label="碳水" unit="g" value={carb} onChange={setCarb} />
        <NumberField id="food-tef-fat" label="脂肪" unit="g" value={fat} onChange={setFat} />
      </div>

      {/* The TEF range is the answer and takes the large type, not the total
          intake: this tool's whole reason to exist is the number people do not
          have, and 蛋白质×4＋碳水×4＋脂肪×9 is arithmetic anyone can do
          (see the note above). The intake is context and sits under it. */}
      {/* The basis is grouped with the number it qualifies rather than left as
          the next item in the panel's `space-y-4` — 16px below the result reads
          as a new section, when it is really a footnote to the one above. It
          stays outside `aria-live` so a screen reader is not made to re-read
          the method on every keystroke. */}
      <div className="space-y-2">
        <div aria-live="polite">
          {answered ? (
            <>
              <p className="text-micro text-ink-subtle">消化本身要消耗</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {low}–{high}
                <span className="ml-1 text-small font-normal text-ink-muted">kcal</span>
              </p>
              <p className="mt-1 text-small text-ink-muted">
                这一餐合计约 <span className="tabular-nums">{Math.round(intake)}</span> kcal。
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">填上这一餐的克数，就能算出消化本身要花掉多少能量。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          估算依据：蛋白质 20–30%、碳水 5–10%、脂肪 0–3% 的热量用于消化。这是范围值，不是精确结果。
        </p>
      </div>

      <ResultSend result={answered ? result : null} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
