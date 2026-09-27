/**
 * 时差换算 — docs/04_AGENT_SPEC.md §7
 *
 * **No UTC offset is written down anywhere in this file.** Not `+8` for Beijing,
 * not `-5` for New York, and no DST calendar. Every offset is read from the
 * runtime's `Intl` data *at the instant being asked about*, which is the only
 * way the answer survives a country changing its rules. That is also why this
 * cannot be the usual "subtract two numbers from a table" calculator: a table is
 * a drifting constant, and §7 forbids them.
 *
 * The list below is cities, not offsets, because a city is what a traveller
 * actually knows. Nothing here says what time it is there; that is the runtime's
 * job, and it is the part that stays correct without us.
 */

import { type CalendarDate, type Minutes } from "@/lib/tools/dates";

export interface City {
  /** IANA zone id — also the value the picker submits. */
  zone: string;
  /** Chinese label. The only part the user sees. */
  label: string;
}

/**
 * One city per zone, chosen for recognisability to a Chinese reader.
 *
 * Deliberately not exhaustive. A long list is harder to use than a short one,
 * and every entry is a claim that this city is worth offering — so the set is
 * the places people actually fly to, not every zone in the database. Zones that
 * share an offset (香港 and 北京) are still both listed, because a traveller
 * thinks in cities.
 */
export const CITIES: readonly City[] = [
  { zone: "Asia/Shanghai", label: "北京" },
  { zone: "Asia/Hong_Kong", label: "香港" },
  { zone: "Asia/Taipei", label: "台北" },
  { zone: "Asia/Tokyo", label: "东京" },
  { zone: "Asia/Seoul", label: "首尔" },
  { zone: "Asia/Singapore", label: "新加坡" },
  { zone: "Asia/Bangkok", label: "曼谷" },
  { zone: "Asia/Kolkata", label: "新德里" },
  { zone: "Asia/Dubai", label: "迪拜" },
  { zone: "Europe/Moscow", label: "莫斯科" },
  { zone: "Europe/London", label: "伦敦" },
  { zone: "Europe/Paris", label: "巴黎" },
  { zone: "America/New_York", label: "纽约" },
  { zone: "America/Chicago", label: "芝加哥" },
  { zone: "America/Los_Angeles", label: "洛杉矶" },
  { zone: "America/Vancouver", label: "温哥华" },
  { zone: "Australia/Sydney", label: "悉尼" },
  { zone: "Pacific/Auckland", label: "奥克兰" },
];

export function cityLabel(zone: string): string {
  return CITIES.find((city) => city.zone === zone)?.label ?? zone;
}

/**
 * Formatters are cached because building one compiles a small amount of locale
 * data, and the tool rebuilds its answer on every keystroke of the last field.
 * A memo of a pure function, so the cache cannot go stale.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let found = formatters.get(zone);
  if (found === undefined) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, found);
  }
  return found;
}

interface WallFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function fieldsAt(zone: string, instant: number): WallFields {
  const parts = formatterFor(zone).formatToParts(new Date(instant));
  const field = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: field("year"),
    month: field("month"),
    day: field("day"),
    // Some ICU versions report midnight as hour 24 under `hour12: false`.
    hour: field("hour") % 24,
    minute: field("minute"),
    second: field("second"),
  };
}

/**
 * The zone's offset from UTC, in minutes, **at a given instant**.
 *
 * Read by rendering the instant in the zone and asking which UTC instant would
 * have produced that same wall clock. It is the standard `Intl` route, and the
 * only one available: `Date.prototype.getTimezoneOffset` answers for the
 * *browser's* zone and is useless for every other city, which is the whole
 * subject of this tool.
 *
 * The offset is a function of the instant, not of the zone. New York is -300 in
 * January and -240 in July, and a caller that reads it once and reuses it will
 * be an hour wrong for half the year.
 */
export function offsetAt(zone: string, instant: number): number {
  const fields = fieldsAt(zone, instant);
  const asIfUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
  // Whole seconds on both sides, so the subtraction is exact.
  const truncated = Math.floor(instant / 1000) * 1000;
  return (asIfUtc - truncated) / 60_000;
}

/**
 * The instant at which the clock in `zone` reads the given wall time.
 *
 * Two passes. The offset needed is the one in effect *at the answer*, and the
 * first pass only knows the offset at a guess; the second corrects it. Real
 * zones converge after one correction, and the second pass covers a transition
 * landing between the guess and the result.
 *
 * Two cases are genuinely ambiguous and are deliberately not special-cased: a
 * wall time that occurs twice (the hour a zone repeats when it leaves DST) and
 * one that never occurs (the hour it skips). We take whatever the runtime
 * resolves them to. Inventing a rule for them would be inventing a fact about a
 * transition we have no data for, which is the thing this file exists to avoid.
 */
export function instantOf(zone: string, date: CalendarDate, at: Minutes): number {
  // The wall time read as if it were UTC — an intermediate, never an answer.
  const wall = Date.UTC(date.year, date.month - 1, date.day) + at * 60_000;
  const first = wall - offsetAt(zone, wall) * 60_000;
  return wall - offsetAt(zone, first) * 60_000;
}

export interface ZonedTime {
  date: CalendarDate;
  at: Minutes;
}

/** Renders an instant as the wall clock in `zone`. */
export function zonedTimeAt(zone: string, instant: number): ZonedTime {
  const fields = fieldsAt(zone, instant);
  return {
    date: { year: fields.year, month: fields.month, day: fields.day },
    at: fields.hour * 60 + fields.minute,
  };
}

export interface FlightInput {
  /** Zone id of the departure city. */
  from: string;
  /** Zone id of the arrival city. */
  to: string;
  departDate: CalendarDate;
  /** Departure time on the departure city's clock. */
  departAt: Minutes;
  flightMinutes: number;
}

export interface Flight {
  /** When the plane lands, on the destination's clock. */
  arrival: ZonedTime;
  /** The same instant on the departure city's clock — 「家里现在是几点」. */
  arrivalAtHome: ZonedTime;
  /**
   * How far ahead the destination's clock is, in minutes, **at the moment of
   * landing**. Negative means behind.
   *
   * Measured at the arrival instant rather than the departure one, because that
   * is the comparison a traveller makes on landing, and because it is the
   * reading that stays right when a transition happens mid-flight.
   */
  difference: number;
}

export function arrivalOf(input: FlightInput): Flight {
  const departure = instantOf(input.from, input.departDate, input.departAt);
  const landing = departure + input.flightMinutes * 60_000;

  return {
    arrival: zonedTimeAt(input.to, landing),
    arrivalAtHome: zonedTimeAt(input.from, landing),
    difference: offsetAt(input.to, landing) - offsetAt(input.from, landing),
  };
}

/**
 * 「快 12 小时」 / 「慢 5 小时 30 分钟」 — the phrase a traveller uses.
 *
 * Carries the half hour rather than rounding to a whole number of hours,
 * because New Delhi is +5:30 and a tool that says 「快 2 小时」 about it would be
 * confidently wrong. The sign is not printed; the caller supplies which city it
 * is relative to, so the sentence reads as a comparison rather than as a number.
 */
export function formatDifference(minutes: number): string {
  if (minutes === 0) return "没有时差";

  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts = [hours > 0 ? `${hours} 小时` : "", rest > 0 ? `${rest} 分钟` : ""].filter((part) => part !== "");
  return `${minutes > 0 ? "快" : "慢"} ${parts.join(" ")}`;
}
