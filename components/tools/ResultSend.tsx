"use client";

import { Button } from "@/components/ui/Button";
import type { ToolProps } from "@/components/tools/types";

/**
 * The one control every tool ends with — docs/04_AGENT_SPEC.md §7.
 *
 * Shared rather than copied, for the same reason `components/ui/field.ts` is: the
 * three tools must behave identically here, and the states below (no result yet,
 * no key, a turn already running) are exactly the sort of thing that gets handled
 * in one copy and forgotten in another.
 *
 * Disabled with a reason rather than hidden. A tool with no way to reach the
 * expert reads as a dead end, and 「先在设置里填好 API Key」 is the difference
 * between a dead end and an instruction.
 */
export function ResultSend({
  result,
  onSend,
  ready,
  busy,
}: { result: string | null } & Pick<ToolProps, "onSend" | "ready" | "busy">) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!ready || busy || result === null}
        onClick={() => {
          if (result !== null) onSend(result);
        }}
      >
        把结果发给专家
      </Button>
      {!ready ? <span className="text-micro text-ink-subtle">先在设置里填好 API Key</span> : null}
      {ready && busy ? <span className="text-micro text-ink-subtle">等这条回答说完</span> : null}
    </div>
  );
}
