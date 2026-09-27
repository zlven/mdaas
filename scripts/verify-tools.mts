/**
 * The instant tools' Node-checkable half — docs/04_AGENT_SPEC.md §7.
 *
 * Run: npm run verify:tools
 *
 * **Why this file exists at all.** Until it did, no tool had a single test —
 * not `parseAmount`, not `formatDuration`, not one line of the arithmetic in the
 * three that shipped. The components below `components/tools/` are markup around
 * a handful of pure functions, and those functions are where a wrong answer
 * hides: `monthAge` on a month end, the review peak in a study plan, an offset
 * read in January and reused in July. None of them needs a browser, and none of
 * them was checked.
 *
 * That is why the risky arithmetic was moved out of the components into
 * `lib/tools/` in the same change. A component cannot be driven from Node; a
 * module can.
 *
 * **What is deliberately NOT here.**
 *
 *   - **Tool-id resolution** (C4's registry rule). `AgentConfig.tools` is
 *     `readonly ToolId[]` and `TOOL_COMPONENTS` is `Record<ToolId, …>`, so a
 *     dangling id is a compile error in both directions and a runtime check
 *     would be unreachable. The check below that every id has a non-empty
 *     Chinese label and description is the part the type does *not* give —
 *     `Record<ToolId, string>` is satisfied by `""`.
 *   - **That a tool makes no network call** (§7's first rule, and C1). Nothing
 *     enforces it — not a lint rule, not the build. It holds today because all
 *     ten tools are arithmetic or `Intl`, and it is checked by reading them,
 *     which is not a test. Recorded here rather than implied.
 *
 * Every check is paired in a comment with **what to delete to make it go red**,
 * and each must go red *on that check* — an import error is also red and does
 * not count. `CLAUDE.md` records two occasions where a check that could not fail
 * was mistaken for coverage.
 *
 * Needs a browser instead: whether each tool's empty state reads right, whether
 * the answer appears at the moment it should, and D11/D12 (the chip row stays
 * one line; switching tools keeps a half-filled form). See
 * `docs/06_ACCEPTANCE.md` §D.
 */

import { existsSync } from "node:fs";
import * as nodeModule from "node:module";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

// Type-only, so they are erased before Node resolves them. Everything under
// `lib/` is therefore imported dynamically below the hook — a dynamic `import()`
// gives a value, not a namespace, so `types.CalendarDate` in a type position is
// `TS2503: Cannot find namespace`.
import type { CalendarDate } from "../lib/tools/dates.ts";

interface ResolveResult {
  url: string;
  shortCircuit?: boolean;
}
type NextResolve = (specifier: string, context: unknown) => ResolveResult;

/**
 * **Why this is not `import { registerHooks } from "node:module"`.** The runtime
 * is Node 22.17 and `registerHooks` landed in 22.15 — but the repo pins
 * `@types/node@^20`, which predates it. So the function exists and its type does
 * not, and the plain named import is a compile error against a program that
 * runs. One assertion, in one place, with this comment; same as
 * `verify-upload.mts` and `verify-workflow.mts`.
 */
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => ResolveResult;
  }) => void;
};

const ROOT = resolvePath(process.cwd());
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolvePath(ROOT, specifier.slice(2));
      // Extension probing, because the repo writes internal imports without one
      // (`@/lib/llm/errors`) and Node does not resolve that the way TS does.
      for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const dates = await import("../lib/tools/dates.ts");
const estimate = await import("../lib/tools/estimate.ts");
const plan = await import("../lib/tools/word-plan.ts");
const zone = await import("../lib/tools/timezone.ts");
const toolTypes = await import("../lib/tools/types.ts");
const registry = await import("../lib/agents/registry.ts");

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

function section(name: string): void {
  console.log(`\n${name}`);
}

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Shorthand, because every date assertion below writes two of these. */
const D = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });
const D0 = D(2026, 10, 1);

// ---------------------------------------------------------------------------
section("Reading what the user typed — lib/tools/estimate.ts");

// Red if: `parseAmount` stops distinguishing blank from zero, or stops
// rejecting negatives. Both are the same failure — computing a confident answer
// from a form that was never filled in.
check("blank is not zero", estimate.parseAmount("") === null && estimate.parseAmount("   ") === null);
check("unparseable is not zero", estimate.parseAmount("abc") === null && estimate.parseAmount("1,200") === null);
check("a negative amount is refused", estimate.parseAmount("-5") === null);
check("zero is an answer, not a blank", estimate.parseAmount("0") === 0);
check("decimals survive", estimate.parseAmount("12.5") === 12.5);

// Red if: `parseOptionalAmount` is collapsed into `parseAmount`, which turns an
// empty 年终奖 into "not answered" and blocks a complete-looking form; or into
// `?? 0`, which turns a typo into a confident zero.
check("optional: blank is zero here", estimate.parseOptionalAmount("") === 0);
check("optional: whitespace is still blank", estimate.parseOptionalAmount("   ") === 0);
check("optional: a real zero is zero", estimate.parseOptionalAmount("0") === 0);
check("optional: a number survives", estimate.parseOptionalAmount("3000") === 3000);
check("optional: a typo is not zero", estimate.parseOptionalAmount("3ooo") === null);
check("optional: a negative is refused", estimate.parseOptionalAmount("-1") === null);

// Red if: the seconds are split before they are rounded, which prints
// 「0 分 60 秒」. Also pinned: the exact minute drops the seconds clause, so
// 59.6 s is 「1 分」 and not 「1 分 0 秒」.
check("59.4 s is under a minute", estimate.formatDuration(59.4) === "59 秒");
check("59.6 s rounds up into the minute", estimate.formatDuration(59.6) === "1 分");
check("a whole minute drops the seconds", estimate.formatDuration(120) === "2 分");
check("minutes and seconds both print", estimate.formatDuration(105) === "1 分 45 秒");
check("a negative duration floors at zero", estimate.formatDuration(-3) === "0 秒");

// Red if: `formatYuan` is swapped for `toLocaleString`, whose separators depend
// on the runtime's ICU data. §5 fixes the form as plain digits.
const big = estimate.formatYuan(1234567);
check("no thousands separator", !big.includes(",") && !big.includes(" ") && big === "1234567", big);
check("no currency symbol", !big.includes("¥") && !big.includes("￥"));
check("decimals are honoured", estimate.formatYuan(12.456, 1) === "12.5");

// ---------------------------------------------------------------------------
section("Calendar arithmetic — lib/tools/dates.ts");

// Red if: `parseDate` stops validating, and 2026-02-30 rolls forward into March.
// A date that does not exist must not become a date that does.
check("a day that does not exist is refused", dates.parseDate("2026-02-30") === null);
check("a day that does exist in a leap year is kept", eq(dates.parseDate("2024-02-29"), D(2024, 2, 29)));
check("February 29 is refused in a common year", dates.parseDate("2026-02-29") === null);
check("month 13 is refused", dates.parseDate("2026-13-01") === null);
check("an empty field is refused", dates.parseDate("") === null);
check("single-digit month and day are accepted", eq(dates.parseDate("2026-1-5"), D(2026, 1, 5)));
check("the format round-trips", dates.formatDate(D(2026, 1, 5)) === "2026-01-05");

// Red if: `addDays` is rewritten with `setDate(getDate() + n)`, which crosses a
// DST boundary an hour out, or walks months a day wrong at the ends.
check("across a month end", eq(dates.addDays(D(2026, 1, 31), 1), D(2026, 2, 1)));
check("across a year end", eq(dates.addDays(D(2026, 12, 31), 1), D(2027, 1, 1)));
check("into a leap day", eq(dates.addDays(D(2024, 2, 28), 1), D(2024, 2, 29)));
check("backwards out of March", eq(dates.addDays(D(2026, 3, 1), -1), D(2026, 2, 28)));
check("day counting is exact", dates.diffDays(D(2026, 1, 1), D(2026, 3, 1)) === 59);

// Red if: `localToday` is written as `toISOString().slice(0, 10)`, which answers
// in UTC — yesterday for anyone far enough east, today's date for nobody west.
check("today is the local date", eq(dates.localToday(new Date(2026, 8, 27, 7, 0)), D(2026, 9, 27)));

// Red if: the day is not clamped, and 1 月 31 日 plus a month becomes 3 月 2 日.
check("a month end clamps", eq(dates.addMonths(D(2026, 1, 31), 1), D(2026, 2, 28)));
check("the clamp respects a leap year", eq(dates.addMonths(D(2024, 1, 31), 1), D(2024, 2, 29)));
check("a long month does not clamp", eq(dates.addMonths(D(2026, 1, 15), 1), D(2026, 2, 15)));
check("months carry across a year", eq(dates.addMonths(D(2026, 12, 15), 1), D(2027, 1, 15)));

// Red if: `monthAge` is rewritten as "subtract the months, then subtract the
// days". That version reports 0 个月 29 天 for a baby who is one month old, which
// is the single most likely way for this tool to be wrong.
check("a month end is one month, not 29 days", eq(dates.monthAge(D(2024, 1, 31), D(2024, 2, 29)), { months: 1, days: 0 }));
check("the day before the anniversary is still the old month", eq(dates.monthAge(D(2024, 1, 31), D(2024, 2, 28)), { months: 0, days: 28 }));
check("a birthday is exactly one month", eq(dates.monthAge(D(2026, 3, 15), D(2026, 4, 15)), { months: 1, days: 0 }));
check("the day before it is not", eq(dates.monthAge(D(2026, 3, 15), D(2026, 4, 14)), { months: 0, days: 30 }));
check("a leap-day birthday lands on the 28th a year later", eq(dates.monthAge(D(2024, 2, 29), D(2025, 2, 28)), { months: 12, days: 0 }));
// The monotonicity the clamp buys: a larger date never reports a smaller month.
check("a month later is a month older", dates.monthAge(D(2024, 1, 31), D(2024, 3, 1)).months === 1);
// Negative days rather than a clamped zero, so the caller can say the date is
// in the future instead of printing 「0 天」.
check("a future birth date reports negative days", dates.monthAge(D(2026, 5, 1), D(2026, 4, 1)).days < 0);

// Red if: the clock parse accepts 24:00, which is not a time on a 24-hour face.
check("midnight parses", dates.parseClock("00:00") === 0);
check("23:59 parses", dates.parseClock("23:59") === 1439);
check("24:00 is refused", dates.parseClock("24:00") === null);
check("minute 60 is refused", dates.parseClock("07:60") === null);
check("a one-digit minute is refused", dates.parseClock("7:5") === null);
check("a bare number is refused", dates.parseClock("700") === null);
check("the clock round-trips", dates.formatClock(420) === "07:00");
check("a full day wraps to midnight", dates.formatClock(1440) === "00:00");

// Red if: `shiftClock` does the subtraction on the clock face, so a bedtime
// counted back from a morning alarm comes out negative. That is the normal
// case, not an edge case: 07:00 minus 8 h 20 min is the previous evening.
// Asserted on the number, not through `formatClock`. The first draft read
// `formatClock(shiftClock(...))` and passed with the wrap deleted — `formatClock`
// wraps too, so it repaired the damage and the assertion proved nothing. It has
// to ask whether the *value* is in the day.
check("a countdown crosses midnight", dates.shiftClock(420, -500) === 1360);
check("a countdown wraps forward too", dates.shiftClock(1430, 20) === 10);
check("no shift is identity", dates.shiftClock(420, 0) === 420);
check("a shift always lands inside the day", [dates.shiftClock(0, -1), dates.shiftClock(1439, 1), dates.shiftClock(420, -500)].every((at) => at >= 0 && at < 1440));

// ---------------------------------------------------------------------------
section("背单词计划 — lib/tools/word-plan.ts");

const planInput = { total: 1500, perDay: 30, start: D0 };
const long = plan.wordPlan(planInput)!;

// Red if: `learnDays` is off by one, which would put the finish date a day out.
check("the day count rounds up", long.learnDays === 50);
// Red if: the schedule stops when the new words do, leaving the last batch
// never reviewed — the one thing a review plan must not do.
check("the schedule runs past the last new word", long.days.length === 50 + 7);
check("every day appears once, in order", long.days.every((day, index) => day.day === index + 1));
check("the finish date is the last day of new words", eq(long.finish, dates.addDays(D0, 49)));
check("the last review is the end of the schedule", eq(long.lastReview, dates.addDays(D0, 56)));

// Red if: the peak is taken as the first day rather than the heaviest, or the
// tie-break flips to the last of equals — either way the copy names a day the
// user should not brace for. Day 8 is the first day all three gaps fire at once.
check("the peak is the day the review window fills", long.peak.day === 8);
check("the peak is 30 new plus 90 to review", long.peak.fresh === 30 && long.peak.review === 90);
// Red if: the load is described as a lone spike. From day 8 to day 50 every day
// is the same 120 words, and 「最重的一天」 on its own would be a half-truth.
check("the peak is reported as sustained", long.sustainedPeak);

const short = plan.wordPlan({ total: 100, perDay: 30, start: D0 })!;

// Red if: the last batch takes a full `perDay` instead of the remainder, so the
// plan totals more words than the user has and finishes a day late.
check("the last batch takes the remainder", eq(short.days.slice(0, 4).map((day) => day.fresh), [30, 30, 30, 10]));
check("the totals add up to the list", short.days.reduce((sum, day) => sum + day.fresh, 0) === 100);
check("a short plan still gets its review tail", short.days.length === 4 + 7);
// `?.` rather than `!` on the index reads below. A `!` would be a promise the
// harness cannot keep: if the tail is missing, the assertion that matters is
// 「the tail is missing」, not a TypeError three lines before it. A crash exits
// non-zero, so it looks like a red run — but it names no assertion, which is
// the one thing this file exists to do.
// The longest gap never fires twice here, so the peak really is one day — and it
// is day 3, not day 8: 30 new plus 60 to review beats 0 new plus 30.
check("a short plan peaks early and alone", short.peak.day === 3 && !short.sustainedPeak);
check("the review tail drains to the last batch", short.days.at(-1)?.review === 10);

// Red if: the review column is computed from the wrong end, so the gaps stop
// affecting it. The new-word column must NOT move — the gaps schedule reviews,
// they do not change how many words a day introduces.
const narrow = plan.wordPlan({ ...planInput, gaps: [1] })!;
// The learning period only, since a shorter gap list also means a shorter tail
// — comparing the whole arrays would fail on length and say nothing about the
// column under test.
check(
  "the gaps do not change the new-word column",
  eq(narrow.days.slice(0, narrow.learnDays).map((d) => d.fresh), long.days.slice(0, long.learnDays).map((d) => d.fresh)),
);
check("the gaps do change the review column", narrow.days[7]?.review !== long.days[7]?.review);
// And the tail shortens with the longest gap, which is why the two arrays are
// different lengths in the first place.
check("a shorter gap list means a shorter tail", narrow.days.length === narrow.learnDays + 1);

// Red if: the guard is dropped. `perDay` of 0 has no last day, so the loop
// would never terminate — this is a hang, not a wrong number.
check("no words per day is not a plan", plan.wordPlan({ total: 1500, perDay: 0, start: D0 }) === null);
check("no words is not a plan", plan.wordPlan({ total: 0, perDay: 30, start: D0 }) === null);
check("a negative count is not a plan", plan.wordPlan({ total: -5, perDay: 30, start: D0 }) === null);

// ---------------------------------------------------------------------------
section("时差换算 — lib/tools/timezone.ts");

const JANUARY = Date.UTC(2026, 0, 15);
const JULY = Date.UTC(2026, 6, 15);

// Red if: an offset is read once and reused, or written down as a constant.
// The whole point of these three is that the same zone answers differently in
// January and July.
check("Shanghai is +8 all year", zone.offsetAt("Asia/Shanghai", JANUARY) === 480 && zone.offsetAt("Asia/Shanghai", JULY) === 480);
check("New York is -5 in January", zone.offsetAt("America/New_York", JANUARY) === -300);
check("New York is -4 in July", zone.offsetAt("America/New_York", JULY) === -240);
check("New Delhi keeps its half hour", zone.offsetAt("Asia/Kolkata", JANUARY) === 330);

// Red if: the inversion treats the wall time as the browser's local time — the
// one-line version, `new Date("2026-10-01T09:00")`, which is silently wrong for
// every city except the one the user happens to be sitting in.
const tokyoDeparture = zone.instantOf("Asia/Tokyo", D(2026, 10, 1), 9 * 60);
check("a wall time resolves to the right instant", tokyoDeparture === Date.UTC(2026, 9, 1, 0, 0));
check("and it renders back to the same wall time", eq(zone.zonedTimeAt("Asia/Tokyo", tokyoDeparture), { date: D(2026, 10, 1), at: 540 }));
const laDeparture = zone.instantOf("America/Los_Angeles", D(2026, 10, 1), 9 * 60);
check("a zone behind UTC round-trips too", eq(zone.zonedTimeAt("America/Los_Angeles", laDeparture), { date: D(2026, 10, 1), at: 540 }));

// The case that actually needs the second pass, and the reason the two above do
// not prove it: Tokyo and Los Angeles on a settled date have a constant offset,
// so a one-pass inversion is exactly right there. New York on 2026-03-08 is not
// — 02:00–03:00 local does not exist that morning, and the wall time below sits
// an hour past the skip. The guess renders as 22:00 the previous day at -300, so
// one pass returns 08:00Z, which reads back as 04:00. Two passes are what make it
// 03:00.
const springForward = zone.instantOf("America/New_York", D(2026, 3, 8), 3 * 60);
check("a wall time one hour past a DST skip round-trips", eq(zone.zonedTimeAt("America/New_York", springForward), { date: D(2026, 3, 8), at: 180 }));

// Red if: the difference is computed at the departure instant instead of the
// landing one, which is the version that breaks when a transition happens
// mid-flight. Shanghai 09:00 to New York, 13 hours in the air: 01:00 UTC plus
// 13 is 14:00 UTC, which is 10:00 in New York — arriving before you left.
const october = zone.arrivalOf({ from: "Asia/Shanghai", to: "America/New_York", departDate: D(2026, 10, 1), departAt: 9 * 60, flightMinutes: 13 * 60 });
check("landing time is on the destination's clock", eq(october.arrival, { date: D(2026, 10, 1), at: 10 * 60 }));
check("home time is on the departure clock", eq(october.arrivalAtHome, { date: D(2026, 10, 1), at: 22 * 60 }));
check("the difference is read at landing", october.difference === -720);

// The DST assertion proper: the same flight, the same wall clock, six months
// apart, is an hour different — and only because the offset was re-read.
const winter = zone.arrivalOf({ from: "Asia/Shanghai", to: "America/New_York", departDate: D(2026, 1, 15), departAt: 9 * 60, flightMinutes: 13 * 60 });
check("the same flight differs across the DST boundary", winter.difference === -780 && winter.difference !== october.difference);

// Red if: the half hour is rounded away — 「快 2 小时」 about New Delhi would be
// confidently wrong.
check("a whole-hour difference reads as one", zone.formatDifference(-720) === "慢 12 小时");
check("a half hour is carried", zone.formatDifference(330) === "快 5 小时 30 分钟");
check("an hour and a half is carried", zone.formatDifference(-90) === "慢 1 小时 30 分钟");
check("no difference is named", zone.formatDifference(0) === "没有时差");

// Red if: a zone is duplicated in the list, which would make two picker entries
// share a value and silently collapse.
check("every city zone is distinct", new Set(zone.CITIES.map((city) => city.zone)).size === zone.CITIES.length);
check("every city has a Chinese label", zone.CITIES.every((city) => city.label.trim() !== ""));
check("a city label resolves", zone.cityLabel("Asia/Tokyo") === "东京");

// ---------------------------------------------------------------------------
section("Registry — lib/tools/types.ts, lib/agents/registry.ts");

// Red if: an id is added to `TOOL_DEFINITIONS` without a label, which the
// `Record<ToolId, ToolDefinition>` type accepts — it does not require a
// non-empty string, and an empty chip is a blank button in the row.
for (const id of toolTypes.TOOL_IDS) {
  const definition = toolTypes.TOOL_DEFINITIONS[id];
  check(`${id} has a label and a description`, definition.id === id && definition.label.trim() !== "" && definition.description.trim() !== "");
}
check("there is a definition per id", Object.keys(toolTypes.TOOL_DEFINITIONS).length === toolTypes.TOOL_IDS.length);
check("the tool list is the ten this change ships", toolTypes.TOOL_IDS.length === 10);

// Red if: a config names a tool that is not in `TOOL_IDS`. This is already a
// compile error; it is asserted here because the failure it would cause is a
// blank panel at runtime rather than a build failure, and because the check
// costs nothing next to the registry import that is already happening.
const known = new Set<string>(toolTypes.TOOL_IDS);
for (const agent of registry.listAgents()) {
  for (const id of agent.tools) {
    check(`${agent.id} declares a real tool`, known.has(id), id);
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("all green");
console.log(
  "\nThis covers the arithmetic the tools share, the study plan, the timezone\n" +
    "offsets and the tool registry.\n" +
    "What needs a browser is listed at the end of docs/06_ACCEPTANCE.md §D: D11,\n" +
    "D12, and each tool's empty state and send handoff.\n",
);
