/**
 * Calendar and clock arithmetic for the instant tools — docs/04_AGENT_SPEC.md §7
 *
 * The existing tools do their arithmetic inline, and that is right for a
 * multiplication: anyone can check `people × hours × rate` at a glance. Date
 * arithmetic is the opposite case. Whether 2024-01-31 to 2024-02-29 is "one
 * month" or "twenty-nine days" depends on a convention that is nowhere in the
 * code, and the wrong answer looks exactly like the right one. So the parts that
 * can be silently wrong live here, where `scripts/verify-tools.mts` can drive
 * them.
 *
 * **No `Date` arithmetic below.** `new Date("2026-01-31")` parses as UTC
 * midnight, which renders as 2026-01-30 for anyone west of Greenwich, and
 * `setDate(getDate() + 1)` steps by wall clock, so it lands an hour out on a DST
 * boundary. Everything here converts to a day number instead, so a day is a day
 * everywhere and no result depends on where the reader is sitting. `localToday`
 * is the one exception, and it is the boundary: it reads one date off a `Date`
 * and everything downstream is calendar work.
 */

export interface CalendarDate {
  year: number;
  /** 1–12. `Date` uses 0–11; this does not. */
  month: number;
  /** 1–31. */
  day: number;
}

/** Minutes after local midnight, 0–1439. Named so a call site cannot pass ms. */
export type Minutes = number;

const MINUTES_PER_DAY = 1440;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Days since 1970-01-01 in the proleptic Gregorian calendar — Howard Hinnant's
 * `days_from_civil`.
 *
 * Private, because a day number is an implementation detail; `diffDays` and
 * `addDays` are what callers want. It needs no lookup table and no leap-year
 * special case, which is exactly why it is worth the four lines over a hand-
 * rolled month walk.
 */
function dayNumber(date: CalendarDate): number {
  const year = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (date.month + (date.month > 2 ? -3 : 9)) + 2) / 5) + date.day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  // The 719468 shifts the era-based count onto the Unix epoch.
  return era * 146097 + dayOfEra - 719468;
}

/** The inverse of `dayNumber` — Hinnant's `civil_from_days`. */
function fromDayNumber(days: number): CalendarDate {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex + (monthIndex < 10 ? 3 : -9);
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(dayNumber(date) + days);
}

/** Signed: positive when `to` is later than `from`. */
export function diffDays(from: CalendarDate, to: CalendarDate): number {
  return dayNumber(to) - dayNumber(from);
}

/** Negative, zero or positive, for `<`/`==`/`>` style checks without a `Date`. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return dayNumber(a) - dayNumber(b);
}

/**
 * Reads `YYYY-MM-DD`, the format `<input type="date">` submits.
 *
 * Validity is checked, not assumed: 2026-02-30 is rejected rather than rolled
 * forward into March, because a date field that silently accepts a day that does
 * not exist produces an age or a countdown nobody can trace back to a typo.
 * Month and day are allowed one digit, since a person may type them.
 */
export function parseDate(text: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

const pad = (value: number): string => String(value).padStart(2, "0");

export function formatDate(date: CalendarDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/**
 * The calendar date **where the reader is**.
 *
 * `toISOString().slice(0, 10)` is the usual way to write this and it is wrong
 * for most of the planet for part of every day: it answers in UTC, so at 07:00
 * in Shanghai it returns yesterday. The `Date` is a parameter rather than a call
 * to `new Date()` inside, so a test can pin it — this is the only impure edge in
 * the file and it stays visible.
 */
export function localToday(now: Date): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * Shifts by whole months, **clamping the day to the target month's length**.
 *
 * 2024-01-31 plus one month is 2024-02-29, not 2024-03-02. The clamp is the
 * convention every monthly anniversary already uses — a child born on the 31st
 * turns one month old on the last day of February — and it is what keeps
 * `monthAge` from reporting a month that has overflowed into the next one.
 */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export interface MonthAge {
  /** Completed months. */
  months: number;
  /** Days since the last monthly anniversary. */
  days: number;
}

/**
 * Completed months and days from `birth` to `asOf`.
 *
 * The subtraction everyone writes first — count the months, then subtract the
 * days — is wrong whenever the day of month wraps. From 2024-01-31 to 2024-02-29
 * it reports "0 months, 29 days", because 29 < 31, and the caller then prints
 * 「29 天」 for a baby who is one month old. The fix is to walk back to the
 * largest monthly anniversary that is not after `asOf`, which is what the loop
 * below does; the loop runs at most a couple of times and the `months > 0` guard
 * keeps it from running off the start of the range.
 *
 * `days` is negative when `asOf` precedes `birth`. Callers check that case
 * themselves rather than getting a silently clamped zero, because "the date you
 * entered is in the future" and "this baby is zero days old" are different
 * answers and only one of them is true.
 */
export function monthAge(birth: CalendarDate, asOf: CalendarDate): MonthAge {
  let months = Math.max(0, (asOf.year - birth.year) * 12 + (asOf.month - birth.month));
  let anchor = addMonths(birth, months);

  while (months > 0 && compareDates(anchor, asOf) > 0) {
    months -= 1;
    anchor = addMonths(birth, months);
  }

  return { months, days: diffDays(anchor, asOf) };
}

function wrapMinutes(at: Minutes): Minutes {
  const wrapped = at % MINUTES_PER_DAY;
  return wrapped < 0 ? wrapped + MINUTES_PER_DAY : wrapped;
}

/** Reads `HH:MM`, the format `<input type="time">` submits. */
export function parseClock(text: string): Minutes | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (match === null) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Renders minutes as `HH:MM`, wrapping — so 1440 prints as `00:00`. */
export function formatClock(at: Minutes): string {
  const wrapped = wrapMinutes(at);
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/**
 * Moves a time of day by a signed number of minutes, wrapping at midnight.
 *
 * The wrap is the whole reason this is a function. A bedtime counted back from a
 * morning alarm crosses midnight most of the time — 07:00 minus eight hours and
 * twenty minutes is the previous evening — and `07:00 − 8:20` done on the clock
 * face gives −1:20, which is not a time anyone can act on.
 */
export function shiftClock(start: Minutes, delta: Minutes): Minutes {
  return wrapMinutes(start + delta);
}
