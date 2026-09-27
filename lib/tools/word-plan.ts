/**
 * 背单词计划 — docs/04_AGENT_SPEC.md §7
 *
 * Turns three numbers the user already has — 词汇总量, 每天新词, 开始日期 — into
 * the thing they actually want to know: how many days this takes, when it ends,
 * and which day is the heavy one. The heavy day is the point. Everyone plans
 * 「每天 30 个」 and nobody plans for the day the reviews pile up, so the plan
 * looks fine for a week and then collapses.
 *
 * **The arithmetic lives here rather than in the component** because it is not
 * one multiplication. It is a rolling window over an interval list, and the
 * interesting answers — the peak, the trailing review tail — are emergent
 * properties of that window. A reader cannot check them by eye, which is exactly
 * the case `lib/tools/estimate.ts`'s header says to extract and test.
 */

import { addDays, type CalendarDate } from "@/lib/tools/dates";

/**
 * Review gaps, in days after the day a batch is learned.
 *
 * These are not an Ebbinghaus table recalled from somewhere. They are the
 * schedule `knowledge/study/英语复习方法.md` already gives — 「当天、次日、
 * 第三天、一周后各回看一次」. The 当天 pass happens on the learning day itself,
 * so it occupies no column here; the other three are the 1 / 2 / 7 below.
 *
 * Sourcing them from our own reference material rather than from a remembered
 * curve is the §7 rule: a tool may not assert a fact we cannot point at.
 */
export const REVIEW_GAPS = [1, 2, 7] as const;

export interface WordPlanDay {
  /** 1-based. Day 1 learns the first batch. */
  day: number;
  date: CalendarDate;
  /** New words that day. 0 once the list is exhausted. */
  fresh: number;
  /** Words coming due for review that day. */
  review: number;
}

export interface WordPlan {
  /** Every day from the first batch to the last review. */
  days: WordPlanDay[];
  /** Days that introduce new words — the answer to 「多久背完」. */
  learnDays: number;
  /** The last day that introduces new words. */
  finish: CalendarDate;
  /** The last day of the whole schedule, when the final review comes due. */
  lastReview: CalendarDate;
  /** The heaviest day by 新词 + 复习. */
  peak: WordPlanDay;
  /**
   * Whether the peak load carries on to the last day of new words.
   *
   * It usually does. Once the review window is full the day's work stops
   * changing — every day is 「新词 30 + 复习 90」 until the list runs out — so the
   * peak is a plateau, and `peak.day` is where the plateau *starts*, not a lone
   * spike. The distinction is a sentence the UI has to get right: 「最重的一天是
   * 第 8 天」 reads as if the other days are lighter, and they are not.
   *
   * False for a short plan that ends before the longest gap ever fires, where
   * the peak really is a single day.
   */
  sustainedPeak: boolean;
}

export interface WordPlanInput {
  /** 词汇总量. */
  total: number;
  /** 每天新词. */
  perDay: number;
  /**
   * The day the plan starts.
   *
   * Passed in rather than read from the clock, so the same input always produces
   * the same plan — which is what makes the peak and the finish date testable.
   */
  start: CalendarDate;
  /** Defaults to `REVIEW_GAPS`. */
  gaps?: readonly number[];
}

/**
 * Returns `null` for an input no plan can be made from.
 *
 * Not a defensive assertion about the caller: both counts come from free-text
 * fields. `perDay` of 0 has no last day, so the loop below would never
 * terminate, and a total of 0 is a plan with nothing in it. A null result is a
 * case the component already has to render, since the form starts empty.
 */
export function wordPlan(input: WordPlanInput): WordPlan | null {
  const total = Math.floor(input.total);
  const perDay = Math.floor(input.perDay);
  if (!Number.isFinite(total) || !Number.isFinite(perDay)) return null;
  if (total <= 0 || perDay <= 0) return null;

  const gaps = [...new Set(input.gaps ?? REVIEW_GAPS)]
    .filter((gap) => Number.isInteger(gap) && gap > 0)
    .sort((a, b) => a - b);
  const longestGap = gaps.length > 0 ? gaps[gaps.length - 1]! : 0;

  const learnDays = Math.ceil(total / perDay);
  // The plan does not end when the last new word is learned. The final batch is
  // still due for review `longestGap` days later, and a review plan that stopped
  // at 背完 would be the one thing a review plan must not do. The tail days carry
  // 新词 0 and a shrinking 复习 count, which is what actually happens.
  const horizon = learnDays + longestGap;

  const freshOn = (day: number): number => {
    if (day < 1 || day > learnDays) return 0;
    // The last batch takes whatever is left rather than a full `perDay`, so the
    // total is exactly `total` and the finish date is not a day late.
    return Math.min(perDay, total - perDay * (day - 1));
  };

  const days: WordPlanDay[] = [];
  for (let day = 1; day <= horizon; day++) {
    let review = 0;
    for (const gap of gaps) review += freshOn(day - gap);
    days.push({ day, date: addDays(input.start, day - 1), fresh: freshOn(day), review });
  }

  // Strict `>` keeps the earliest of equals, and that matters: the load plateaus
  // for as long as the review window stays full, so 「最重的一天」 would otherwise
  // name an arbitrary day in the middle of the plateau.
  let peak = days[0]!;
  for (const day of days) {
    if (day.fresh + day.review > peak.fresh + peak.review) peak = day;
  }

  const lastLearnDay = days[learnDays - 1]!;

  return {
    days,
    learnDays,
    finish: addDays(input.start, learnDays - 1),
    lastReview: days[days.length - 1]!.date,
    peak,
    sustainedPeak: peak.day < learnDays && lastLearnDay.fresh + lastLearnDay.review === peak.fresh + peak.review,
  };
}
