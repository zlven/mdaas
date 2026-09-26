"use client";

import { useState } from "react";

import { ResultSend } from "@/components/tools/ResultSend";
import type { ToolProps } from "@/components/tools/types";
import { FIELD, LABEL } from "@/components/ui/field";
import { formatDuration } from "@/lib/tools/estimate";

/**
 * 口播时长 — docs/04_AGENT_SPEC.md §7
 *
 * Answers "will this fit?" before the script is recorded. A 口播 script that runs
 * long is discovered at the microphone, which is the most expensive place to
 * discover it.
 *
 * The rate is given as a range and the answer as a range, because reading speed
 * varies with the person, the pacing and the material. A single number would look
 * authoritative and be wrong for most people reading it.
 *
 * The word count strips whitespace and keeps punctuation, which is how 口播
 * length is normally counted — punctuation is spoken as a pause, so dropping it
 * would under-report.
 */

/** 中文口播的常见语速区间, 字/分钟. */
const RATE_SLOW = 240;
const RATE_FAST = 300;

function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

export default function SpeakingTime({ onSend, ready, busy }: ToolProps) {
  const [script, setScript] = useState("");

  const chars = countChars(script);
  const secondsFast = (chars / RATE_FAST) * 60;
  const secondsSlow = (chars / RATE_SLOW) * 60;

  const hasText = chars > 0;

  const result =
    `我这段口播文案一共 ${chars} 字。按中文口播语速（每分钟约 ${RATE_SLOW}–${RATE_FAST} 字）估算，` +
    `读完大概要 ${formatDuration(secondsFast)} 到 ${formatDuration(secondsSlow)}。` +
    `帮我看看哪里可以删，或者怎么调整节奏。\n\n文案：\n${script.trim()}`;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="speaking-time-script" className={LABEL}>
          口播文案
        </label>
        <textarea
          id="speaking-time-script"
          rows={6}
          value={script}
          onChange={(event) => setScript(event.target.value)}
          placeholder="把要念的文案粘贴进来"
          // `FIELD` plus the one thing a textarea needs that an input does not.
          // Spelling the border and background out again here is how the two
          // drift apart, and the 1.7 line-height §J2 requires already comes from
          // the `text-body` token — it is not restated.
          className={`${FIELD} resize-y`}
        />
      </div>

      <div className="space-y-2">
        <div aria-live="polite">
          {hasText ? (
            <>
              {/* The word count moves into the label: it is the input restated,
                  and the duration is what the user came for. */}
              <p className="text-micro text-ink-subtle">{chars} 字，读完大约</p>
              <p className="text-h2 font-semibold tabular-nums text-ink">
                {formatDuration(secondsFast)} – {formatDuration(secondsSlow)}
              </p>
            </>
          ) : (
            <p className="text-small text-ink-subtle">粘贴文案，估算读出来要多久。</p>
          )}
        </div>

        <p className="text-micro text-ink-subtle">
          估算依据：中文口播每分钟约 {RATE_SLOW}–{RATE_FAST} 字，标点计入。实际时长取决于语速和停顿。
        </p>
      </div>

      <ResultSend result={hasText ? result : null} onSend={onSend} ready={ready} busy={busy} />
    </div>
  );
}
