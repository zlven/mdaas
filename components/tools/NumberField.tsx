"use client";

import { FIELD, LABEL } from "@/components/ui/field";

/**
 * A labelled numeric input for the instant tools — docs/04_AGENT_SPEC.md §7.
 *
 * Shared for the same reason `components/ui/field.ts` is: 食物热效应 and 会议成本
 * each had their own copy of this, identical apart from the id prefix, and two
 * copies of a control are identical right up until one of them is edited.
 *
 * The caller passes the whole id, not a prefix, because nothing stops an agent
 * from declaring two tools (`AgentConfig.tools` is a list) and two of these on
 * one page have to have distinct ids.
 */
export function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      {/* The unit lives in the label, not as a suffix in the field: 「175」 in a
          box marked 「身高（cm）」 is unambiguous, where a suffix invites someone
          to type 「175cm」. */}
      <label htmlFor={id} className={LABEL}>
        {label}（{unit}）
      </label>
      <input
        id={id}
        // `type="number"` would add spinners and accept "e"; decimal input mode
        // gets the numeric keypad on a phone without either.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      />
    </div>
  );
}
