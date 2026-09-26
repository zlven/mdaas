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
 */

import type { ProfileField } from "@/lib/agents/types";
import type { ProfileEntry } from "@/lib/rag/context";

export function profileEntries(
  declared: readonly ProfileField[] | undefined,
  values: Readonly<Record<string, string>>,
): ProfileEntry[] {
  if (declared === undefined) return [];

  const entries: ProfileEntry[] = [];

  for (const field of declared) {
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

  return entries;
}
