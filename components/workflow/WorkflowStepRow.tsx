"use client";

import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import type { WorkflowStepState } from "@/lib/workflow/types";

/**
 * One step of a run — docs/03_UI_UX_SPEC.md §7
 *
 * §7 fixes four things about this row and they are the whole component: the
 * marker sits **on** the rule, a done step is individually expandable, a failed
 * step carries an error line and a retry control with prior output preserved, and
 * the running marker pulses and stops pulsing under `prefers-reduced-motion`.
 *
 * **The four markers are hand-drawn SVG, not `○ ◉ ✓ ✕`.** Those are typographic
 * characters: they fall through `--font-sans` to whichever glyph the CJK
 * fallback happens to provide, so their weight, size and vertical centring differ
 * per machine — and `◉` is missing from enough fonts to render as a tofu box.
 * This is the same problem `components/ui/Disclosure.tsx` solves by drawing its
 * own chevron instead of trusting the browser's `summary` triangle, and it has
 * the same answer. Four paths, `size-3`, every colour from a token (J1).
 *
 * **The retry control lives here and nowhere else.** F5 says the retry is on the
 * failed step. Putting a second one in a run-level error card would make "there
 * is a retry on this step" into "there are two controls and they might differ".
 */

/** `ABORTED` is the user's own doing — their stop button, or a reload. */
function isStopped(step: WorkflowStepState): boolean {
  return step.status === "failed" && step.error?.code === "ABORTED";
}

/**
 * The marker's colour, and the only place status colour appears in a run.
 *
 * `--danger` is held back for a genuine fault: §2 reserves status colour for
 * status, and a user who pressed 停止 and then sees a red cross has been told
 * they did something wrong. `Workspace` already draws this line for a stopped
 * chat turn — an aborted answer shows no error card at all — and this is the same
 * rule applied to a step.
 */
function markerClass(step: WorkflowStepState): string {
  if (isStopped(step)) return "text-ink-muted";
  switch (step.status) {
    case "done":
      return "text-success";
    case "failed":
      return "text-danger";
    case "running":
      return "text-accent";
    case "pending":
      return "text-ink-subtle";
  }
}

function labelClass(step: WorkflowStepState): string {
  switch (step.status) {
    case "running":
    case "failed":
      return "text-ink";
    case "done":
      return "text-ink-muted";
    case "pending":
      return "text-ink-subtle";
  }
}

/**
 * The glyph inside the marker.
 *
 * A ring for待跑 rather than an empty box: the row must not look like a checkbox
 * the user is expected to tick. A filled dot for 运行中, which is also the only
 * state that animates, so the pulse reads as "here" rather than as decoration.
 */
function glyph(step: WorkflowStepState) {
  if (step.status === "running") return <circle cx="6" cy="6" r="3.5" fill="currentColor" />;

  if (step.status === "done") {
    return (
      <path
        d="M2.5 6.25 5 8.75 9.5 3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (step.status === "failed") {
    // The same cross whether it failed or was stopped — only the colour changes,
    // because in both cases the step did not produce its output.
    return (
      <path
        d="M3.25 3.25 8.75 8.75M8.75 3.25 3.25 8.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    );
  }

  return <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />;
}

function Marker({ step }: { step: WorkflowStepState }) {
  return (
    // `bg-bg` is load-bearing: the rule is a 1px border on the column *behind*
    // this box, and without the page background behind the glyph the line runs
    // straight through the ring and the check.
    <span className={`flex size-3 shrink-0 items-center justify-center bg-bg ${markerClass(step)}`}>
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        // The pulse is on the SVG and not on the wrapper: the wrapper's
        // background is what hides the rule, and fading *that* would let the line
        // flash through the marker once per cycle.
        className={`size-3 ${step.status === "running" ? "workflow-marker-running" : ""}`}
      >
        {glyph(step)}
      </svg>
    </span>
  );
}

/** The word beside the label, when the marker alone would be ambiguous. */
function StatusWord({ step }: { step: WorkflowStepState }) {
  if (step.status === "running") return <span className="text-micro text-ink-subtle">运行中…</span>;
  if (step.status === "pending") return <span className="sr-only">等待中</span>;
  if (isStopped(step)) return <span className="text-micro text-ink-subtle">已停止</span>;
  return null;
}

export function WorkflowStepRow({
  step,
  last,
  onRetry,
}: {
  readonly step: WorkflowStepState;
  /** The bottom row draws no rule, or the line would hang below the last step. */
  readonly last: boolean;
  /** Passed only for the failed step — see the note above. */
  readonly onRetry?: () => void;
}) {
  const stopped = isStopped(step);
  const error = step.status === "failed" ? step.error : undefined;

  const label = (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className={labelClass(step)}>{step.label}</span>
      <StatusWord step={step} />
    </span>
  );

  return (
    <li className="flex gap-3">
      {/* `items-stretch` is the default, which is what makes the border run the
          full height of the row and therefore join the row below it. That is also
          why the list has no `gap`: a gap would break the rule into dashes. */}
      <div className={`flex w-3 shrink-0 justify-center ${last ? "" : "border-l border-line"}`}>
        <Marker step={step} />
      </div>

      <div className="min-w-0 flex-1 pb-4">
        {/* No chevron on a step with nothing in it: a `Disclosure` that opens
            onto an empty box reads as broken, and every pending step would have
            one. `tone="plain"` because this row is already *inside* the run
            container — a second bordered box here would be a box in a box. */}
        {step.text === "" ? (
          <p className="text-small">{label}</p>
        ) : (
          <Disclosure tone="plain" summary={label}>
            {/* Deliberately plain text rather than `<Markdown>`: this is the
                step's own output shown back as it arrived, which is what makes
                it useful for reading one stage early (§7). The formatted
                artefact is assembled below by `WorkflowResult`, and rendering
                the same text through the markdown pipeline twice would make the
                two views disagree about what the model wrote. */}
            <p className="whitespace-pre-wrap text-small text-ink-muted">{step.text}</p>
          </Disclosure>
        )}

        {error ? (
          <div className="mt-1">
            <p className={`text-micro ${stopped ? "text-ink-muted" : "text-danger"}`}>{error.message}</p>
            {onRetry ? (
              <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
                重试这一步
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
