"use client";

import { Button } from "@/components/ui/Button";
import type { ToolProps } from "@/components/tools/types";

/**
 * The one control every tool ends with — docs/04_AGENT_SPEC.md §7.
 *
 * Shared rather than copied, for the same reason `components/ui/field.ts` is:
 * every tool must behave identically here, and the states below (no result yet,
 * no key, a turn already running) are exactly the sort of thing that gets handled
 * in one copy and forgotten in another. That argument was made when there were
 * three tools; there are ten now, and it has only got stronger.
 *
 * Disabled with a reason rather than hidden. A tool with no way to reach the
 * expert reads as a dead end, and 「先在设置里填好 API Key」 is the difference
 * between a dead end and an instruction.
 *
 * **The footer row.** `04_AGENT_SPEC.md` §7 says a tool that dead-ends is a
 * calculator with our branding on it — and this was the smallest element in the
 * panel, a `sm` button with no separator, sitting wherever the tool's last
 * paragraph happened to end. It now closes the panel behind the same hairline
 * the profile form uses for 清空档案, at `md` (docs/03_UI_UX_SPEC.md §5).
 *
 * It stays `secondary` on purpose. §2 allows one `--accent` action per screen and
 * the chat input's 发送 already holds it; a second primary would make neither
 * read as primary. Prominence here comes from the container and the position,
 * not from colour.
 */
export function ResultSend({
  result,
  onSend,
  ready,
  busy,
}: { result: string | null } & Pick<ToolProps, "onSend" | "ready" | "busy">) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={!ready || busy || result === null}
        onClick={() => {
          if (result !== null) onSend(result);
        }}
      >
        把结果发给专家
      </Button>
      {/* Both are instructions, not footnotes, so neither takes `--micro`
          `--ink-subtle` — that pairing is for the estimation basis, which the
          user is not expected to act on. */}
      {!ready ? <span className="text-small text-ink-muted">先在设置里填好 API Key</span> : null}
      {ready && busy ? <span className="text-small text-ink-muted">等这条回答说完</span> : null}
    </div>
  );
}
