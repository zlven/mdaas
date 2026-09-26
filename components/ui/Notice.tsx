import type { AppError } from "@/lib/llm/errors";

/**
 * An inline notice for a condition the user did not cause.
 *
 * Deliberately **neutral**, not `--danger`. §2 reserves status colour for
 * genuine status, and a red banner the user can do nothing about — a browser
 * setting, not a mistake — teaches people to ignore red. It is also persistent
 * rather than dismissible, so "ignore it" is the only way to live with a red one.
 *
 * Takes an `AppError` rather than children so the wording stays in
 * `lib/llm/errors.ts` with every other user-facing failure message, and so
 * Settings can reuse this exact component for its own storage degradation
 * (`06_ACCEPTANCE.md` G10) instead of growing a second banner with different
 * phrasing for the same situation.
 */
export function Notice({ error, action }: { error: AppError; action?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface-alt p-3">
      <p className="text-small text-ink-muted">{error.message}</p>
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
