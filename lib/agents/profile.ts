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

import type { ProfileField } from "@/lib/agents/types";
import type { ProfileEntry } from "@/lib/rag/context";

/**
 * The free-text field every agent carries — docs/04_AGENT_SPEC.md §6.
 *
 * The key is a constant rather than configuration, and the label is authored
 * here rather than by the user. That is what keeps the profile's injection
 * defence intact: `formatProfile` escapes the *value* on each line and trusts
 * the label, on the grounds that every label is ours, so a label a user could
 * write would be the one unguarded way onto a bulleted list. This one is not
 * user-authored either.
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

export function profileEntries(
  declared: readonly ProfileField[] | undefined,
  values: Readonly<Record<string, string>>,
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

  // Last, so the facts the agent asked for come before the user's own words.
  const notes = values[PROFILE_NOTES_KEY];
  if (notes !== undefined && notes.trim() !== "") {
    entries.push({ label: PROFILE_NOTES_LABEL, value: notes });
  }

  return entries;
}
