"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

import { SeriesChart } from "@/components/series/SeriesChart";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { FIELD, LABEL } from "@/components/ui/field";
import { formatChars } from "@/components/ui/format";
import { Notice } from "@/components/ui/Notice";
import { RailSection } from "@/components/ui/RailSection";
import { metricBasis } from "@/lib/agents/profile";
import type { AgentConfig, MetricSuggestion } from "@/lib/agents/types";
import { pointsFullError, seriesFullError, type AppError } from "@/lib/llm/errors";
import { formatValue, longDate } from "@/lib/series/format";
import {
  MAX_SERIES_NAME_CHARS,
  MAX_SERIES_NOTE_CHARS,
  MAX_SERIES_PER_AGENT,
  MAX_SERIES_UNIT_CHARS,
  MAX_SERIES_VALUE,
  canAddPoint,
  canAddSeries,
  normalizeSeriesName,
  normalizeSeriesNote,
  normalizeSeriesUnit,
} from "@/lib/series/limits";
import type { SeriesPoint } from "@/lib/series/types";
import {
  addSeries,
  logSeriesPoint,
  removeSeries,
  removeSeriesPoint,
  retrySeriesSave,
  savedSeries,
  seriesForm,
  seriesSnapshot,
  serverSeriesForm,
  serverSeriesSnapshot,
  setSeriesForm,
  setSeriesIncluded,
  subscribeSeries,
} from "@/lib/store/series";
import { formatDate, parseDate } from "@/lib/tools/dates";
import { parseAmount } from "@/lib/tools/estimate";

/**
 * 我的记录 — the numbers this expert keeps for you — docs/03_UI_UX_SPEC.md §5,
 * docs/04_AGENT_SPEC.md §9
 *
 * The fourth kind of per-agent state, beside the profile, the 资料夹 and the
 * conversation. A **series** is one thing the user decided to track — a name, a
 * unit, and a number per date — and the panel is where they start one, see it
 * drawn, and correct it.
 *
 * Four things here are requirements rather than styling:
 *
 *   - **It is a mirror, not a coach.** The chart and the panel restate the user's
 *     own numbers and say nothing about what they mean. There is no target, no
 *     healthy band, no trend, no verdict, no colour that depends on direction —
 *     see the `SeriesChart` header for the four prompt boundaries that depends on,
 *     `mental`'s being the one with a safety consequence. Nothing in this file
 *     prints a word of praise or alarm either, and that is not only the chart's
 *     job: a 「比上次好」 chip here would break the same rule from outside the SVG.
 *   - **The verdict belongs to the expert, and it already has the evidence.** The
 *     summary that rides on every message carries 情绪强度 and 睡眠时长 for
 *     `mental`, which is precisely the *pattern* §6.10's first trigger is written
 *     against. That route is why the panel does not need to raise anything itself.
 *   - **One point per date, and re-logging overwrites.** Said three ways, because
 *     a silent overwrite is the one behaviour here a user cannot discover by
 *     trying it: a permanent hint under the date field, the button becoming
 *     「覆盖 3 月 5 日」 with the value it would replace above it, and a per-point
 *     delete so a mis-*dated* point — which overwriting cannot fix — is reachable.
 *   - **It renders in two places, and that is deliberate** — as `ProfilePanel` and
 *     `LibraryPanel` do, for the same reason: below `lg` the rail is gone. Both
 *     copies are in the DOM at once with one hidden by `display: none`, so every
 *     `id`/`htmlFor` carries `idPrefix`, and the two call sites pass different
 *     values. Get it wrong and clicking a label flips nothing.
 *
 * **The draft lives in the store, not in `useState`, and that is what makes the
 * duplication legal.** `ProfilePanel` may be duplicated because it holds no draft;
 * `ToolPanel` may not, because two copies would be two forms. This panel holds a
 * draft *and* is duplicated, which `03_UI_UX_SPEC.md` §5's mounting rule did not
 * cover until this feature — it named two classes and forbade the third. The
 * resolution is that `lib/store/series.ts` keeps one draft per agent in **module
 * state**, outside the record and outside the snapshot, so both copies read one
 * source and a half-typed value survives crossing `lg`. The whole argument is in
 * `SeriesForm`'s doc comment.
 */

export type SeriesVariant = "rail" | "strip";

/**
 * The chip's clothes, deliberately the same as `ToolPanel`'s.
 *
 * **Copied rather than shared, and that is a judgement rather than an oversight.**
 * `components/ui/field.ts` exists because two copies of a control are identical
 * right up until one of them is edited — but those two copies are literally the
 * same input in two forms. These are not the same control: a tool chip toggles a
 * disclosure (`aria-expanded` + `aria-controls`) and this one is a selection
 * (`aria-pressed`), and "active" means "open" on one and "this is the curve you
 * are looking at" on the other. A shared helper would have to carry both meanings,
 * which is how a shared helper acquires a flag. What they share is only the size
 * and the border, and if the two ever need to differ, the reason is already here.
 */
const CHIP = "rounded-[var(--radius-sm)] border px-3 py-1.5 text-micro transition-colors duration-150 ease-out";

function chipClass(active: boolean, disabled = false): string {
  const shape = active
    ? `${CHIP} border-line-strong bg-surface-alt text-ink`
    : `${CHIP} border-line bg-surface text-ink-muted`;
  const rest = disabled ? "cursor-not-allowed opacity-50" : "hover:border-line-strong hover:text-ink";
  return `${shape} ${rest}`;
}

export function SeriesPanel({
  agent,
  variant = "rail",
  idPrefix,
}: {
  agent: AgentConfig;
  variant?: SeriesVariant;
  /** Required: two instances of this panel are in the DOM at once. See the header. */
  idPrefix: string;
}) {
  const agentId = agent.id;

  const subscribe = useCallback((listener: () => void) => subscribeSeries(agentId, listener), [agentId]);
  const getSnapshot = useCallback(() => seriesSnapshot(agentId), [agentId]);
  const getForm = useCallback(() => seriesForm(agentId), [agentId]);

  // Two subscriptions to one store, and the split is the point: a keystroke in
  // the entry form changes only the second, so the first — and with it everything
  // derived from the record — is not invalidated by typing.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSeriesSnapshot);
  const form = useSyncExternalStore(subscribe, getForm, serverSeriesForm);

  /** One series at a time: the id whose 确认删除 row is open. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** One point at a time, keyed by its date — a series' points are unique by date. */
  const [confirmingPoint, setConfirmingPoint] = useState<string | null>(null);
  /**
   * The last refusal, so a mutation the UI did not predict is not swallowed.
   *
   * `useState` because it is transient feedback and not user data — the two
   * mounted copies can hold different values without anything being wrong, since
   * only one is ever visible. The refusals the UI *can* predict are rendered from
   * the record itself (`fullReason`, `pointRoom`), so this only ever carries the
   * unexpected one.
   */
  const [refusal, setRefusal] = useState<AppError | null>(null);

  const body = (): ReactNode => {
    // Its own branch, and the same reason `ProfilePanel` has one: falling through
    // to the empty state here would flash 「还没有记录」 at a user who has a year
    // of them. The cost, stated honestly: the series is genuinely not in the
    // prompt until this read lands, because the send path cannot await.
    if (snapshot.status === "loading") {
      return <p className="text-small text-ink-muted">正在读取这个浏览器里保存的记录…</p>;
    }

    const series = snapshot.series;
    // The store opened but could not be read: series may exist that we have never
    // seen, so they are shown and nothing may change them.
    const unreadable = snapshot.status === "session-only" && !snapshot.editable;
    const editable = !unreadable;

    /**
     * The drawn series.
     *
     * **The fallback to `series[0]` is derived, not written.** The selection is
     * part of the draft and the draft is not persisted, so a returning user's
     * `selectedId` is `null` after the load — and writing the default during
     * render is a side effect in render, while writing it from an effect burns a
     * second render on every mount for a choice the user has not made. Deriving it
     * means the panel opens on a drawn curve instead of on five chips and an
     * empty box.
     *
     * The consequence is handled at the chip: tapping the chip that is already
     * drawn must not call `setSeriesForm`, because the store would see a change
     * from `null` to that id and clear the half-typed value.
     */
    const active = series.find((entry) => entry.id === form.selectedId) ?? series[0] ?? null;

    const suggestions = agent.metrics ?? [];
    const taken = new Set(
      series.map((entry) => entry.metricKey).filter((key): key is string => key !== null),
    );
    const room = canAddSeries(series, null);
    // `MAX_SERIES_PER_AGENT` rather than `room.limit`: passing `metricKey: null`
    // means the duplicate branch cannot fire, and the constant is the same number
    // the store is enforcing.
    const fullReason = room.ok ? null : seriesFullError(MAX_SERIES_PER_AGENT).message;

    // **The send path's own selector, called rather than re-derived.** The cost
    // line and the request have to agree about which series ride along, and the
    // only way to guarantee that is for both to ask the same function.
    const sent = savedSeries(agentId);
    const sentChars = sent.reduce((total, entry) => total + entry.summaryChars, 0);

    // --- The entry form's own values ---------------------------------------
    const parsed = parseDate(form.date);
    const day = parsed === null ? "" : formatDate(parsed);
    const amount = parseAmount(form.value);
    const tooLarge = amount !== null && amount > MAX_SERIES_VALUE;
    const existing = active !== null && day !== "" ? (active.points.find((p) => p.date === day) ?? null) : null;
    const pointRoom = active !== null && day !== "" ? canAddPoint(active, day) : ({ ok: true } as const);
    const canLog = editable && active !== null && day !== "" && amount !== null && !tooLarge && pointRoom.ok;

    const customName = normalizeSeriesName(form.newName);

    const start = (metric: MetricSuggestion): void => {
      const result = addSeries(agentId, { name: metric.label, unit: metric.unit, metricKey: metric.key });
      setRefusal(result.ok ? null : result.error);
    };

    return (
      <div className="space-y-4">
        {snapshot.status === "session-only" ? <Notice error={snapshot.error} /> : null}

        {snapshot.status === "ready" && snapshot.saveError !== null ? (
          <Notice
            error={snapshot.saveError}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => retrySeriesSave(agentId)}>
                重试
              </Button>
            }
          />
        ) : null}

        {series.length === 0 ? (
          <p className="text-small text-ink-muted">
            还没有记录。记一条之后，这里会画出它的变化，专家也能在对话里看到。
          </p>
        ) : null}

        {/* The suggestions, and they are **not** an empty-state affordance: this is
            also how a second curve gets started a month later, so the row stays
            for as long as the agent suggests something untaken. An agent that
            suggests nothing (`parenting`, deliberately) renders no row at all
            rather than an empty one — and nothing special-cases that, because
            `metrics: undefined` is already the "asks for nothing" state. */}
        {editable && suggestions.length > 0 ? (
          <div>
            {/* The lead-in the 「或者自己加一条」 disclosure below needs an
                antecedent for. It also carries the claim the lists are held to:
                every metric here was checked against this agent's own knowledge
                base, which is why they are *suggested* and a hand-made series is
                merely permitted. */}
            <p className="mb-1 text-micro text-ink-subtle">可以记这些：</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((metric) => {
                const used = taken.has(metric.key);
                return (
                  <button
                    key={metric.key}
                    type="button"
                    disabled={used || fullReason !== null}
                    title={metric.hint}
                    onClick={() => start(metric)}
                    className={chipClass(false, used || fullReason !== null)}
                  >
                    {used ? `${metric.label} · 已记` : metric.label}
                  </button>
                );
              })}
            </div>
            {/* The ceiling is a state rather than a fault, so the chips stay
                visible and disabled and this line says why — the `LibraryPanel`
                rule. A control that silently disappears reads as a bug, and a
                hover tooltip is not reachable on a phone. */}
            {fullReason === null ? null : <p className="mt-1 text-micro text-ink-subtle">{fullReason}</p>}
          </div>
        ) : null}

        {refusal === null ? null : <p className="text-micro text-ink-muted">{refusal.message}</p>}

        {series.length > 0 && active !== null ? (
          <>
            {/* The selector. One series at a time: two units cannot share an axis,
                and overlaying them would need a second colour, which §2 does not
                allow. `aria-pressed` rather than `aria-expanded` — this selects,
                it does not disclose. */}
            <div className="flex flex-wrap gap-2">
              {series.map((entry) => {
                const selected = entry.id === active.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      // Guarded, and the guard is load-bearing: when the selection
                      // is being derived from `series[0]`, the store's `selectedId`
                      // is still `null`, so re-selecting the drawn chip would read
                      // as a change and clear the half-typed value.
                      if (!selected) setSeriesForm(agentId, { selectedId: entry.id });
                    }}
                    className={chipClass(selected)}
                  >
                    {entry.name}
                  </button>
                );
              })}
            </div>

            <div>
              <SeriesChart series={active} basis={metricBasis(agent, active.metricKey)} />

              {editable ? (
                <div className="mt-2 space-y-2">
                  {/* Its own control, not a chip: switching a curve off keeps the
                      data and stops paying for it, which is why this is not the
                      same act as deleting. */}
                  <label
                    htmlFor={`${idPrefix}-series-inc-${active.id}`}
                    className="flex items-center gap-2 text-micro text-ink-muted"
                  >
                    <input
                      id={`${idPrefix}-series-inc-${active.id}`}
                      type="checkbox"
                      checked={active.include}
                      onChange={(event) => setSeriesIncluded(agentId, active.id, event.target.checked)}
                      className="accent-[var(--color-accent)]"
                    />
                    <span>
                      每次都带上这一条
                      {/* The name, for a screen reader only — the `LibraryPanel`
                          rule: five checkboxes labelled alike identify nothing, and
                          this is one of the controls that decides what the user
                          pays for. */}
                      <span className="sr-only">：{active.name}</span>
                    </span>
                  </label>

                  {confirmingId === active.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-micro text-ink-muted">删掉后这条曲线和它记的数字都没了。</p>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          removeSeries(agentId, active.id);
                          setConfirmingId(null);
                        }}
                      >
                        确认删除
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                        取消
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(active.id)}
                      className="text-micro text-ink-subtle transition-colors duration-150 ease-out hover:text-ink"
                    >
                      删除这条曲线
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {editable ? (
              <div className="space-y-3 border-t border-line pt-4">
                <div>
                  <label htmlFor={`${idPrefix}-series-date`} className={LABEL}>
                    日期
                  </label>
                  <input
                    id={`${idPrefix}-series-date`}
                    type="date"
                    value={form.date}
                    onChange={(event) => setSeriesForm(agentId, { date: event.target.value })}
                    className={FIELD}
                  />
                  {/* The permanent half of the overwrite rule. Said before the
                      date is chosen rather than after it collides, because the
                      collision is silent otherwise — the point is simply replaced. */}
                  <p className="mt-1 text-micro text-ink-subtle">一天记一条，同一天再记会覆盖。</p>
                </div>

                <div>
                  {/* The unit in the label, not a suffix in the box — the
                      `NumberField` rule: 「62.5」 in a box marked 「体重（kg）」 is
                      unambiguous, where a suffix invites 「62.5kg」. */}
                  <label htmlFor={`${idPrefix}-series-value`} className={LABEL}>
                    {active.unit === "" ? active.name : `${active.name}（${active.unit}）`}
                  </label>
                  <input
                    id={`${idPrefix}-series-value`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.value}
                    onChange={(event) => setSeriesForm(agentId, { value: event.target.value })}
                    className={FIELD}
                    placeholder="例如 62.5"
                  />
                </div>

                <div>
                  <label htmlFor={`${idPrefix}-series-note`} className={LABEL}>
                    备注（可不填）
                  </label>
                  <input
                    id={`${idPrefix}-series-note`}
                    type="text"
                    autoComplete="off"
                    maxLength={MAX_SERIES_NOTE_CHARS}
                    value={form.note}
                    onChange={(event) => setSeriesForm(agentId, { note: event.target.value })}
                    className={FIELD}
                  />
                  {/* Stated where the note is typed, because it is the field people
                      would otherwise assume the expert reads. */}
                  <p className="mt-1 text-micro text-ink-subtle">备注只存在你这边，不会发给专家。</p>
                </div>

                {/* The overwrite, named with the value it will replace. Inline and
                    never a dialog — the UI spec has no dialog idiom and forbids
                    one in three places. */}
                {existing === null ? null : (
                  <p className="text-micro text-ink-muted">
                    {`这一天已经记过 ${formatValue(existing.value)}${active.unit === "" ? "" : ` ${active.unit}`}，保存会覆盖。`}
                  </p>
                )}

                {tooLarge ? (
                  <p className="text-micro text-ink-muted">{`这个数字太大了，一条记录最多记到 ${formatValue(MAX_SERIES_VALUE)}。`}</p>
                ) : null}

                {pointRoom.ok ? null : <p className="text-micro text-ink-muted">{pointsFullError(pointRoom.limit).message}</p>}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canLog}
                  onClick={() => {
                    if (amount === null || active === null || day === "") return;
                    const point: SeriesPoint = {
                      date: day,
                      value: amount,
                      // The store's own normaliser, so the panel and the record
                      // agree about what a note is. `maxLength` on the input is
                      // what keeps the over-length branch unreachable from here.
                      note: normalizeSeriesNote(form.note) ?? "",
                    };
                    const result = logSeriesPoint(agentId, active.id, point);
                    setRefusal(result.ok ? null : result.error);
                    // The date is kept and the value is cleared. Logging a later
                    // measurement is the common next act, and the date is the part
                    // the user set deliberately — resetting it to today would undo
                    // that, and re-logging today is protected by the overwrite rule
                    // and announced by the 覆盖 label.
                    setSeriesForm(agentId, { value: "", note: "" });
                  }}
                >
                  {existing === null ? "记一笔" : `覆盖 ${longDate(day)}`}
                </Button>
              </div>
            ) : null}

            {/* The points, newest first, collapsed. Collapsed because a year of
                them is 365 rows in a 232px column, and reachable rather than
                trimmed because a mis-*dated* point can only be found by looking at
                the dates. */}
            {active.points.length > 0 ? (
              <Disclosure tone="plain" summary={`共 ${active.points.length} 条记录`}>
                <ul className="space-y-2">
                  {[...active.points].reverse().map((point) => {
                    const confirming = confirmingPoint === point.date;
                    return (
                      <li key={point.date} className="text-small">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 tabular-nums text-ink-subtle">{point.date}</span>
                          <span className="min-w-0 flex-1 text-ink">
                            {`${formatValue(point.value)}${active.unit === "" ? "" : ` ${active.unit}`}`}
                          </span>
                          {editable && !confirming ? (
                            <button
                              type="button"
                              onClick={() => setConfirmingPoint(point.date)}
                              aria-label={`删除 ${point.date} 的这条记录`}
                              className="shrink-0 rounded-[var(--radius-sm)] px-1 text-ink-subtle transition-colors duration-150 ease-out hover:text-ink"
                            >
                              <span aria-hidden="true">✕</span>
                            </button>
                          ) : null}
                        </div>

                        {point.note === "" ? null : (
                          <p className="text-micro text-ink-muted">{point.note}</p>
                        )}

                        {confirming ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                removeSeriesPoint(agentId, active.id, point.date);
                                setConfirmingPoint(null);
                              }}
                            >
                              确认删除
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingPoint(null)}>
                              取消
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Disclosure>
            ) : (
              <p className="text-micro text-ink-subtle">这一条还没有数字。</p>
            )}

            <p className="text-micro text-ink-subtle">
              {sent.length === 0
                ? "这些记录都会保存，但不会每次都带上。"
                : `每次发消息会带上 ${sent.length} 条，共 ${formatChars(sentChars)} 字（按你自己的 Key 计费）。`}
            </p>
          </>
        ) : null}

        {/* 自己加一条. Nothing suggests it, so it carries no claim — which is the
            distinction the suggestion lists are held to, and the reason this is a
            disclosure rather than a sixth chip in the row above. The draft inside
            it lives in the store, so a half-typed name survives crossing `lg`. */}
        {editable ? (
          <Disclosure tone="plain" summary="或者自己加一条">
            <div className="space-y-3">
              <div>
                <label htmlFor={`${idPrefix}-series-new-name`} className={LABEL}>
                  记什么
                </label>
                <input
                  id={`${idPrefix}-series-new-name`}
                  type="text"
                  autoComplete="off"
                  maxLength={MAX_SERIES_NAME_CHARS}
                  value={form.newName}
                  onChange={(event) => setSeriesForm(agentId, { newName: event.target.value })}
                  className={FIELD}
                  placeholder="例如 每天走多少步"
                />
              </div>

              <div>
                <label htmlFor={`${idPrefix}-series-new-unit`} className={LABEL}>
                  单位（可不填）
                </label>
                <input
                  id={`${idPrefix}-series-new-unit`}
                  type="text"
                  autoComplete="off"
                  maxLength={MAX_SERIES_UNIT_CHARS}
                  value={form.newUnit}
                  onChange={(event) => setSeriesForm(agentId, { newUnit: event.target.value })}
                  className={FIELD}
                  placeholder="例如 步"
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={customName === null || fullReason !== null}
                onClick={() => {
                  if (customName === null) return;
                  const result = addSeries(agentId, {
                    name: customName,
                    unit: normalizeSeriesUnit(form.newUnit) ?? "",
                    metricKey: null,
                  });
                  setRefusal(result.ok ? null : result.error);
                  // Cleared here rather than inside `addSeries` — tapping a
                  // suggestion from the row above must not wipe a name being typed.
                  setSeriesForm(agentId, { newName: "", newUnit: "" });
                }}
              >
                建立
              </Button>

              {fullReason === null ? null : <p className="text-micro text-ink-subtle">{fullReason}</p>}
            </div>
          </Disclosure>
        ) : null}

        {editable ? (
          // The same honest statement the 资料夹 carries, for the same reason.
          // 永久保存 and 不会丢失 are claims this product cannot make, and it
          // matters more here than there: what is in this panel is a measurement
          // the user took, which the product cannot regenerate for them.
          // `--text-small` and not Body, for the reason spelled out at the same
          // line in `ProfilePanel`: this is fine print about the data, not the
          // data, and it matters more here than there — what this panel holds is
          // a measurement the product cannot regenerate for the user.
          <p className="border-t border-line pt-3 text-small text-ink-subtle">
            记录保存在这个浏览器里，不跨设备同步。清除站点数据、使用无痕模式，或浏览器存储空间不足时，记录可能丢失。
          </p>
        ) : null}
      </div>
    );
  };

  const summary = (): string => {
    if (snapshot.status === "loading") return "读取中";
    if (snapshot.status === "session-only" && !snapshot.editable) return "读取失败";
    // 条曲线 rather than 条: 条 counts points in the summary and in the point list
    // below, and a heading that reads 「已记 5 条」 over a list reading 「共 12 条」
    // is two different units in one panel.
    return snapshot.series.length === 0 ? "还没记" : `已记 ${snapshot.series.length} 条曲线`;
  };

  const heading = `我的记录 · ${summary()}`;

  if (variant === "strip") {
    return <Disclosure summary={heading}>{body()}</Disclosure>;
  }

  // The rail's idiom, declared once in `RailSection` — and *not* a `<details>`:
  // the rail is permanently open, and one accordion among six plain sections
  // reads as a different kind of thing. (The strip variant above is the
  // exception: there the panel is one row in the composer's layout and owes that
  // layout its own disclosure shape.)
  return (
    <RailSection title="我的记录" note={summary()}>
      {body()}
    </RailSection>
  );
}
