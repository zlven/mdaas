/**
 * The shared form-control classes — docs/03_UI_UX_SPEC.md §2, §8.
 *
 * Extracted from `SettingsForm` so the profile form and Settings cannot drift
 * into two subtly different text inputs. They are the same control and should
 * look identical; two copies of a Tailwind string are identical right up until
 * one of them is edited.
 *
 * Every value here is a §2 token. Nothing invents a colour, a radius or a size.
 */

export const FIELD =
  "mt-1 w-full rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-subtle";

export const LABEL = "block text-small font-medium text-ink";
