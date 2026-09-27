/**
 * Declared fields + stored values → what goes into the prompt.
 * docs/04_AGENT_SPEC.md §6, docs/02_TECH_SPEC.md §9
 *
 * The join between two things that are deliberately separate: the agent's config
 * says which facts it wants, and the store holds whatever the user typed. Neither
 * knows about the other, which is what keeps `lib/store/memory.ts` replaceable
 * (it never learns what a 身高 is) and `AgentConfig` declarative.
 *
 * **The config decides what is sent, never the record.** Iterating `declared`
 * rather than `fields` means a value left behind by a config that has since
 * dropped a field — or one written by a hand-edited record — is not forwarded to
 * the model. Otherwise removing a field from a config would silently keep
 * sending it, which is the opposite of what removing it means.
 *
 * **补充说明 is the one deliberate exception**, and it does not weaken that rule.
 * The rule exists to stop a *record* from outvoting a *config* about a field the
 * config owns; no config owns this key. Both sides read it from the constants
 * below, so there is nothing for a stale record to disagree with.
 */

import type { AgentConfig, ProfileField } from "@/lib/agents/types";
import type { ProfileEntry } from "@/lib/rag/context";
import { seriesSummary } from "@/lib/series/summary";
import type { Series } from "@/lib/series/types";

/**
 * The free-text field every agent carries — docs/04_AGENT_SPEC.md §6.
 *
 * The key is a constant rather than configuration, and the label is authored
 * here rather than by the user.
 *
 * This comment used to give the second half of that as the reason the field is
 * safe — `formatProfile` escapes the *value* and trusts the label, so a label the
 * user could write would be the one unguarded way onto a bulleted list. That is no
 * longer how the defence works: `formatProfile` now escapes the label too, because
 * a 我的记录 series name is user-authored. The constant label is kept because one
 * definition of 补充说明 is better than two, not because it is load-bearing for
 * security.
 *
 * `lib/agents/registry.ts` rejects a config that declares a field with this key.
 */
export const PROFILE_NOTES_KEY = "notes";
export const PROFILE_NOTES_LABEL = "补充说明";

/**
 * What to store for 补充说明, or `null` to remove the key.
 *
 * **Not `trim()`, and that is the whole reason this function exists.** A
 * declared field is a single-line fact, so `setProfileField` stores the trimmed
 * value and treats empty as "remove the key" — one representation of "not
 * answered". Applying that here makes the textarea impossible to use: typing a
 * second line means the value ends in `\n` for exactly one keystroke, and a trim
 * would take it away again before the next character arrived. Newlines are the
 * point of this field.
 *
 * So whitespace-only removes the key, and anything else is stored as typed. The
 * visible cost is that pressing Enter in an otherwise empty box does nothing;
 * that is better than a box that cannot be made to hold two lines.
 *
 * Nothing downstream depends on the stored value being tidy: `formatProfile`
 * trims and collapses newlines on the way into the prompt.
 */
export function normalizeNotes(value: string): string | null {
  return value.trim() === "" ? null : value;
}

/**
 * The 口径 for a metric, read **live** from the agent's config.
 *
 * Live rather than copied into the series record, which is the opposite of what
 * `name` and `unit` do. The difference is authorship: the name and the unit are
 * the user's, so the record owns them and removing a suggestion must not orphan
 * them; the 口径 is our prose about what a number counts, so it must stay fixable
 * in one place. A basis changed in a config takes effect on the next message, for
 * every series already recorded.
 */
export function metricBasis(agent: AgentConfig, metricKey: string | null): string | undefined {
  if (metricKey === null) return undefined;
  return (agent.metrics ?? []).find((metric) => metric.key === metricKey)?.basis;
}

/**
 * The 我的记录 series → their profile entries, oldest series first.
 *
 * Two entries per series: the summary, then the 口径 that says what the number
 * counts. The second is not decoration — it is the only place the product can say
 * what a user's own number means without interpreting it, and for `mental` it is
 * load-bearing in the other direction: `情绪强度` is *emotional intensity*, so the
 * 口径 is what stops a rising line from reading as improvement.
 *
 * **The unit goes in the label, not in `unit`.** `formatProfile` renders a unit as
 * a suffix on the value, which is right for a declared field (`身高：175 cm`) and
 * wrong here: the value is a sentence, and 「共 12 条…最近 3 次 62.5（09-27） kg」
 * appends the unit to the wrong end of it. `体重（kg）：共 12 条…` is what the panel
 * prints and what the model should read, so the parens are built here.
 *
 * A series with no points is skipped — its summary is `""`, and an entry with an
 * empty value would tell the model about something that does not exist. The
 * caller has usually filtered already (`savedSeries`); this is the second guard,
 * because an empty line in the profile block is a false statement rather than
 * merely a wasteful one.
 */
export function seriesEntries(
  series: readonly Series[],
  basisOf: (metricKey: string | null) => string | undefined,
): ProfileEntry[] {
  const entries: ProfileEntry[] = [];

  for (const entry of series) {
    const summary = seriesSummary(entry);
    if (summary === "") continue;

    entries.push({
      label: entry.unit === "" ? entry.name : `${entry.name}（${entry.unit}）`,
      value: summary,
    });

    const basis = basisOf(entry.metricKey);
    if (basis !== undefined && basis.trim() !== "") {
      // A constant suffix on a user-authored name, so the neutralisation in
      // `formatProfile` sees one string and treats it as one — which is correct,
      // since a delimiter in the name is exactly what it needs to defuse.
      entries.push({ label: `${entry.name} · 口径`, value: basis });
    }
  }

  return entries;
}

export function profileEntries(
  declared: readonly ProfileField[] | undefined,
  values: Readonly<Record<string, string>>,
  extra: readonly ProfileEntry[] = [],
): ProfileEntry[] {
  const entries: ProfileEntry[] = [];

  for (const field of declared ?? []) {
    const value = values[field.key];
    if (value === undefined || value.trim() === "") continue;

    entries.push({
      label: field.label,
      value,
      // A unit belongs to a number. On a `text` field it would render as a
      // suffix on prose.
      unit: field.type === "number" ? field.unit : undefined,
    });
  }

  // After the declared fields and before 补充说明. The ordering decision lives
  // here and only here: a caller passes its entries and does not get to choose
  // where they land, which is what keeps the block's shape in one reviewable
  // place as more sources are added. `extra` is not inlined into `entries` at the
  // call sites because a second implementation of this order is a second answer
  // to the question the order exists to settle.
  entries.push(...extra);

  // Last, so the facts the agent asked for come before the user's own words.
  const notes = values[PROFILE_NOTES_KEY];
  if (notes !== undefined && notes.trim() !== "") {
    entries.push({ label: PROFILE_NOTES_LABEL, value: notes });
  }

  return entries;
}
