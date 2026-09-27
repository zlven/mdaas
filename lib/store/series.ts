/**
 * The per-agent 我的记录 store — docs/02_TECH_SPEC.md §9, docs/04_AGENT_SPEC.md §9
 *
 * One of §12's migration interfaces (`lib/store/*`), so the same rule holds as for
 * the other three: moving to another backend means replacing this file, not
 * chasing call sites. No IndexedDB type appears in the exported surface.
 *
 * Isolation is structural, exactly as in `library.ts` and `memory.ts`: the only
 * read names one agent id and fetches that key. There is no unfiltered read, no
 * cursor, and no secondary lookup, so reading another agent's records means
 * *adding* a call a reviewer will see (06_ACCEPTANCE.md I10). `verify-series.mts`
 * asserts that against this file's own source text, because a property enforced by
 * the absence of a call is otherwise invisible to every test.
 *
 * **Why this is not `library.ts` with different nouns.** Three things differ, and
 * each is a decision:
 *
 *   1. **It holds a draft that is never persisted and never in the snapshot.**
 *      This is the file's one genuinely new idea; see the section below.
 *   2. **A mutation may replace rather than append.** Logging a date that already
 *      has a point corrects it — see `logSeriesPoint`.
 *   3. **The payload is a list of lists.** A point belongs to a series, so every
 *      mutation addresses two ids and has to refuse cleanly when either is gone.
 *
 * Everything else is copied deliberately, and each copy is here because its reason
 * still holds: the synchronous snapshot that reads module state only; a shared
 * frozen loading object; the `loading` variant carrying no payload property so a
 * saved record cannot flash as empty; two-tier degradation with `editable`; a
 * sticky `storageFailed`; schema re-checked on read and discarded rather than
 * migrated; **no write coalescing**, because every write here is one user click.
 */

import {
  MAX_POINTS_PER_SERIES,
  MAX_SERIES_PER_AGENT,
  MAX_SERIES_VALUE,
  SERIES_SUMMARY_MAX_CHARS,
  canAddPoint,
  canAddSeries,
} from "@/lib/series/limits";
import { seriesSummaryChars } from "@/lib/series/summary";
import type { Series, SeriesPoint, SeriesRecord } from "@/lib/series/types";
import { appError, pointsFullError, seriesFullError, type AppError } from "@/lib/llm/errors";
import { formatDate, localToday, parseDate } from "@/lib/tools/dates";
import { parseAmount } from "@/lib/tools/estimate";

const DB_NAME = "mdaas.series";
const DB_VERSION = 1;
const STORE = "series";

/**
 * Stamped on every record and re-checked on every read. Discard rather than
 * migrate, per §9.
 *
 * **What a bump would cost here is higher than in the other three stores**, and
 * the honest note is that it is a real price rather than a formality: a record
 * that fails this check is dropped, and what is dropped is a user's own
 * measurements, which the product cannot regenerate. So the bar for changing the
 * stored shape is that the change is worth that, and a version bump should come
 * with a migration rather than with this comment. It is version 1 and there is
 * nothing to migrate yet.
 */
const SCHEMA_VERSION = 1;

export type SeriesSnapshot =
  | { readonly status: "loading" }
  | {
      readonly status: "session-only";
      readonly series: readonly Series[];
      readonly error: AppError;
      /**
       * False when the store opened but the read failed: series may exist that we
       * have not seen, and writing would destroy them unseen. True only when
       * storage is unusable outright, where nothing was ever persisted.
       */
      readonly editable: boolean;
    }
  | {
      readonly status: "ready";
      readonly series: readonly Series[];
      /** Set when a write did not commit. Cleared by an explicit retry. */
      readonly saveError: AppError | null;
    };

/**
 * What a mutation reports back. Callers render the message; the store words
 * nothing (`lib/llm/errors.ts` owns every user-facing string).
 */
export type SeriesResult = { ok: true } | { ok: false; error: AppError };

/**
 * The half-typed entry form.
 *
 * **This is the reason this store is not a copy of `library.ts`.** A record entry
 * is a *transaction*: the value in the box is not the user's data until they press
 * 记一笔, so unlike the 资料夹's toggle it cannot write through on every
 * keystroke. The naive conclusion is that it belongs in the tools' class — a
 * `useState` draft, mounted exactly once in the centre column — but the owner
 * asked for this panel in the right rail, and a rail-mounted form with a
 * centre-column chart would put the input in a different column from the thing it
 * feeds.
 *
 * So the draft lives **here, in module state, but not in the record and not in
 * the snapshot**. Two consequences, and they are the whole point:
 *
 *   - `seriesSnapshot`'s identity is unchanged by a keystroke, so
 *     `useSyncExternalStore` bails out: the chart, the series list, the cost line
 *     and the entire `Workspace` do not re-render. Only the two copies of the form
 *     do, via the separate `seriesForm` subscription below.
 *   - Nothing is written to IndexedDB per keystroke, which is why there is no
 *     coalescing timer and why the re-entrancy loop keeps `library.ts`'s shape.
 *     Persisting the draft would write the whole record — up to a few hundred
 *     kilobytes at the point ceiling against the profile's one — on every
 *     character, and the `COALESCE_MS` that would fix the resulting snowstorm is
 *     exactly the delay `library.ts` refuses for user-owned data («delete
 *     something, reload within the second, and it is back»).
 *
 * A reload discards the draft, which is right for a transaction: an abandoned
 * half-typed number is not data the user meant to keep.
 */
export interface SeriesForm {
  /** Which series the entry form and the chart are showing. */
  selectedId: string | null;
  /** `YYYY-MM-DD` from the date input. Seeded with today — see `newState`. */
  date: string;
  /** The raw text in the value box, before `parseAmount` sees it. */
  value: string;
  note: string;
  /**
   * The 「自己加一条」 draft: the name and unit of a series that does not exist yet.
   *
   * In here rather than in the panel's `useState` for exactly the reason the value
   * box is: the panel is mounted twice, so a component-state draft would be
   * silently abandoned when the window crossed `lg` mid-word. It is the same
   * transaction-shaped draft as `value`, and it is transient in the same way — a
   * reload discards it, which is right for a form that was never submitted.
   *
   * Cleared by the call site that creates the series, **not** by `addSeries`:
   * tapping a suggested metric while halfway through naming your own curve must
   * not wipe what you typed, and `addSeries` cannot tell the two callers apart.
   */
  newName: string;
  newUnit: string;
}

interface SeriesRecordLike {
  agentId: string;
  schemaVersion: number;
  updatedAt: number;
  series: Series[];
}

/* ============================================================================
   Module state — one entry per agent id, never "the current agent"
   ========================================================================= */

interface AgentState {
  snapshot: SeriesSnapshot;
  series: Series[];
  form: SeriesForm;
  loaded: boolean;
  loading: boolean;
  /** Sticky for the session: once a write fails we stop retrying on every click. */
  storageFailed: boolean;
  writing: boolean;
  /** A mutation landed while a write was in flight. */
  dirty: boolean;
  readonly listeners: Set<() => void>;
}

const states = new Map<string, AgentState>();

/**
 * One frozen object shared by every agent that is still loading. Safe to share
 * because `loading` carries no data; a fresh object per call would re-render
 * forever.
 */
const LOADING: SeriesSnapshot = Object.freeze({ status: "loading" });

/**
 * The frozen empty list, reused so `series` has a stable identity.
 *
 * `useSyncExternalStore` compares snapshots by reference. An empty 我的记录 must
 * always be the *same* empty array, or a component reading it re-renders on every
 * store event — including the events a keystroke in the draft fires.
 */
const NO_SERIES: readonly Series[] = Object.freeze([]);

/**
 * The server's and the never-touched agent's form.
 *
 * `date` is empty rather than today's date, deliberately: `localToday` reads the
 * clock, and this object is returned from `getServerSnapshot`, which runs during
 * the prerender. A date computed there would be the build machine's date and
 * would hydrate against the client's differently. The real seed happens in
 * `newState`, which only ever runs in the browser.
 */
const EMPTY_FORM: SeriesForm = Object.freeze({
  selectedId: null,
  date: "",
  value: "",
  note: "",
  newName: "",
  newUnit: "",
});

function newState(): AgentState {
  return {
    snapshot: LOADING,
    series: [],
    // Today, because the overwhelmingly common entry is today's measurement and
    // making the user open a date picker to say so is friction for nothing.
    form: Object.freeze({ ...EMPTY_FORM, date: formatDate(localToday(new Date())) }),
    loaded: false,
    loading: false,
    storageFailed: false,
    writing: false,
    dirty: false,
    listeners: new Set(),
  };
}

function ensureState(agentId: string): AgentState {
  let state = states.get(agentId);
  if (!state) {
    state = newState();
    states.set(agentId, state);
  }
  return state;
}

/** Wakes only this agent's listeners. There is no broadcast. */
function emit(agentId: string): void {
  const state = states.get(agentId);
  if (!state) return;
  for (const listener of state.listeners) listener();
}

function frozenSeries(series: Series[]): readonly Series[] {
  return series.length === 0 ? NO_SERIES : Object.freeze([...series]);
}

function transition(state: AgentState): void {
  const current = state.snapshot;
  if (current.status === "loading") return;

  const series = frozenSeries(state.series);

  state.snapshot =
    current.status === "session-only"
      ? { status: "session-only", series, error: current.error, editable: current.editable }
      : { status: "ready", series, saveError: current.saveError };
}

/* ============================================================================
   Persistence lifetime — see `library.ts` for why the answer is not surfaced
   ========================================================================= */

let persistenceRequested = false;

function requestPersistence(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => {
      // A refusal or a throw changes nothing we tell the user.
    });
  } catch {
    // Some browsers throw on property access in restricted modes.
  }
}

/* ============================================================================
   IndexedDB — one database per store module, as the other four
   ========================================================================= */

/** Thrown from the read path. `editable` decides whether the panel may write. */
class SeriesStorageError extends Error {
  constructor(
    message: string,
    readonly editable: boolean,
  ) {
    super(message);
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  const cached = dbPromise;
  if (cached) return cached;

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB is not available in this environment"));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // `keyPath: agentId` is what makes the isolation structural: the store is
        // keyed by the one thing that scopes a record, so there is no "read
        // everything" operation to forget to filter.
        db.createObjectStore(STORE, { keyPath: "agentId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB.open failed"));
    request.onblocked = () => reject(new Error("indexedDB.open blocked by another tab"));
  });

  dbPromise = pending;
  void pending.catch(() => {
    if (dbPromise === pending) dbPromise = null;
  });

  return pending;
}

/**
 * A value is usable when `parseAmount` agrees with it.
 *
 * **Delegating rather than re-deriving is the point.** `parseAmount` already
 * decides that blank, unparseable and negative are `null`, and the tools already
 * share that rule. A second implementation here would be a second answer to the
 * same question, and the interesting inputs — `-1`, `1e999`, `"abc"` — are exactly
 * where two implementations drift.
 */
function isUsableValue(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  // The cap is a separate rule from parseability, and both are needed: `"1e+30"`
  // parses to exactly `1e30`, so the round-trip below accepts it. Past this cap
  // the number renders in exponent notation in a tick label and in the prompt,
  // which is a value nobody can act on and which the axis arithmetic does not
  // survive either — see `MAX_SERIES_VALUE`.
  if (value > MAX_SERIES_VALUE) return false;
  return parseAmount(String(value)) === value;
}

/**
 * A date is usable when `parseDate` accepts it **and** it is already normalised.
 *
 * The second half is not pedantry. `parseDate` accepts `2026-1-5`, and
 * `"2026-1-5" > "2026-09-27"` compares true as a string, so an unpadded date
 * would sort after September and land on the wrong end of the chart. Everything
 * downstream — the ascending-order invariant, the x-axis, 「最近一次」 in the
 * summary — compares these as strings, so the padded form is the contract.
 */
function isUsableDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = parseDate(value);
  if (parsed === null) return false;
  return formatDate(parsed) === value;
}

function isUsablePoint(value: unknown): value is SeriesPoint {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Partial<SeriesPoint>;
  if (!isUsableDate(point.date)) return false;
  if (!isUsableValue(point.value)) return false;
  if (typeof point.note !== "string") return false;
  if (point.note.includes("\n")) return false;
  return true;
}

function isUsableSeries(value: unknown): value is Series {
  if (typeof value !== "object" || value === null) return false;
  const series = value as Partial<Series>;
  if (typeof series.id !== "string" || series.id === "") return false;
  if (typeof series.name !== "string" || series.name.trim() === "") return false;
  // A newline in a label forges a bullet in the profile block. `formatProfile`
  // neutralises a label now, so this is defence in depth rather than the only
  // guard — but a stored name with one is a record we did not write.
  if (series.name.includes("\n")) return false;
  if (typeof series.unit !== "string" || series.unit.includes("\n")) return false;
  if (series.metricKey !== null && typeof series.metricKey !== "string") return false;
  if (typeof series.include !== "boolean") return false;
  if (typeof series.summaryChars !== "number" || !Number.isFinite(series.summaryChars)) return false;
  // A **bound**, not an equality. Equality against a freshly computed summary
  // would discard every stored record the day someone reworded the summary — a
  // user's year of measurements lost to a changed comma. `library.ts` makes the
  // same choice for `inlineChars`, and the equality that matters is asserted on
  // the *mutation* path in `verify-series.mts`, where a skipped recompute is the
  // bug being caught.
  if (series.summaryChars < 0 || series.summaryChars > SERIES_SUMMARY_MAX_CHARS) return false;
  if (!Array.isArray(series.points)) return false;
  if (series.points.length > MAX_POINTS_PER_SERIES) return false;

  let previous = "";
  for (const point of series.points) {
    if (!isUsablePoint(point)) return false;
    // Strictly ascending, which is also what rejects a duplicate date. The chart
    // re-collapses duplicates so it is total, but a stored record with two points
    // on one day means the overwrite in `logSeriesPoint` was bypassed, and that is
    // a defect worth refusing rather than drawing.
    if (point.date <= previous) return false;
    previous = point.date;
  }
  return true;
}

/**
 * Exported so the schema gate is checkable from Node.
 *
 * The same argument as `isUsableLibraryRecord`: injecting a bad record means
 * writing to IndexedDB, so without this the decision that protects a user's
 * measurements would be unreachable from every test.
 */
export function isUsableSeriesRecord(value: unknown): value is SeriesRecordLike {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<SeriesRecord>;
  if (record.schemaVersion !== SCHEMA_VERSION) return false;
  if (!Array.isArray(record.series)) return false;
  if (record.series.length > MAX_SERIES_PER_AGENT) return false;
  return record.series.every(isUsableSeries);
}

function readRecord(db: IDBDatabase, agentId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readonly");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    // The only read in this file, and the agent id is the only thing that
    // selects it.
    const request = tx.objectStore(STORE).get(agentId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("series read failed"));
  });
}

function writeRecord(db: IDBDatabase, record: SeriesRecordLike): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    tx.objectStore(STORE).put(record);

    // `oncomplete`, not the request's `onsuccess`. A request that succeeded
    // inside a transaction that later aborts has not been written — and here that
    // would mean telling a user their measurement is saved when it is not.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("series write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("series write aborted"));
  });
}

function deleteRecord(db: IDBDatabase, agentId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    tx.objectStore(STORE).delete(agentId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("series delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("series delete aborted"));
  });
}

async function readStoredSeries(agentId: string): Promise<Series[]> {
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch (err) {
    // Nothing was ever persisted, so a session-only record stays editable.
    throw new SeriesStorageError(err instanceof Error ? err.message : String(err), true);
  }

  let raw: unknown;
  try {
    raw = await readRecord(db, agentId);
  } catch (err) {
    // The store opened, so records may exist that we simply could not read.
    throw new SeriesStorageError(err instanceof Error ? err.message : String(err), false);
  }

  if (raw === undefined || raw === null) return [];

  if (!isUsableSeriesRecord(raw)) {
    // Written by another schema version, or corrupt. Dropped rather than guessed
    // at — the version exists precisely so this is a decision and not a gamble.
    try {
      await deleteRecord(db, agentId);
    } catch {
      // A failed discard is not worth reporting: the record is unusable either
      // way, and the read below returns an empty record.
    }
    return [];
  }

  // `summaryChars` is **recomputed and adopted**, not compared. The stored number
  // is a bound the record has to satisfy; the value the panel reads must be the
  // one this build's summary actually costs, or the cost line would quote a
  // figure from an older wording until the next mutation.
  return [...raw.series]
    .map((series) => ({ ...series, summaryChars: seriesSummaryChars(series) }))
    .sort(compareSeries);
}

/* ============================================================================
   Ordering
   ========================================================================= */

/**
 * Oldest first, ties broken by id.
 *
 * **Ascending, so starting a series does not renumber the others.** The chip row
 * and the suggested-metric row both address series by position and by name, and a
 * newest-first order would shuffle every existing chip each time one was added.
 *
 * The id tiebreak is not decoration: `Date.now()` has millisecond resolution and
 * two series created from one batch can share it, which would leave the order to
 * the sort implementation.
 */
function compareSeries(a: Series, b: Series): number {
  const aAt = a.points[0]?.date ?? "";
  const bAt = b.points[0]?.date ?? "";
  if (aAt !== bAt) return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ============================================================================
   Loading
   ========================================================================= */

function applyLoadFailure(agentId: string, err: unknown, editable: boolean): void {
  const state = ensureState(agentId);
  const detail = err instanceof Error ? err.message : String(err);
  state.loaded = true;
  state.loading = false;
  state.storageFailed = true;
  state.snapshot = {
    status: "session-only",
    series: NO_SERIES,
    error: appError(editable ? "STORAGE_UNAVAILABLE" : "STORAGE_READ_FAILED", detail),
    editable,
  };
  emit(agentId);
}

function ensureLoaded(agentId: string): void {
  const state = ensureState(agentId);
  if (state.loaded || state.loading) return;
  state.loading = true;

  // Fire-and-forget, and started here rather than in `seriesSnapshot` for the
  // same reason loading is: `getSnapshot` runs during render.
  requestPersistence();

  void readStoredSeries(agentId)
    .then((series) => {
      const current = ensureState(agentId);
      current.series = series;
      current.loaded = true;
      current.loading = false;
      // The selection survives the load only if it still names something. The
      // panel renders before the read lands, so a user can have tapped a
      // suggestion in the meantime, and clearing their selection would be the
      // store undoing a choice they just made.
      if (current.form.selectedId !== null && !series.some((s) => s.id === current.form.selectedId)) {
        current.form = Object.freeze({ ...current.form, selectedId: null, value: "", note: "" });
      }
      current.snapshot = {
        status: "ready",
        series: frozenSeries(series),
        saveError: null,
      };
      emit(agentId);
      // No mutation can have landed during the read: the write surface refuses to
      // touch a record whose snapshot is still `loading`. Adopting the stored
      // series wholesale is therefore safe.
    })
    .catch((err: unknown) => {
      applyLoadFailure(agentId, err, err instanceof SeriesStorageError ? err.editable : false);
    });
}

/* ============================================================================
   Public read surface
   ========================================================================= */

/**
 * The synchronous snapshot. Reads module state and nothing else.
 *
 * Does not create a state entry: this runs during render, and a render must not
 * have side effects.
 *
 * **The draft is deliberately absent from this object.** Its identity has to be
 * unchanged by a keystroke so that a keystroke re-renders only the form — see the
 * `SeriesForm` doc comment. `seriesForm` below is the other half of that split.
 */
export function seriesSnapshot(agentId: string): SeriesSnapshot {
  return states.get(agentId)?.snapshot ?? LOADING;
}

/** The server's value, for `useSyncExternalStore`'s third argument. */
export function serverSeriesSnapshot(): SeriesSnapshot {
  return LOADING;
}

/**
 * The entry form's state — the second subscription the panel makes.
 *
 * Safe to hand out a module-state object here because `setSeriesForm` always
 * replaces it rather than mutating, so identity changes exactly when the form
 * does. Both mounted copies read this one source, which is what lets a half-typed
 * value survive crossing the `lg` breakpoint.
 */
export function seriesForm(agentId: string): SeriesForm {
  return states.get(agentId)?.form ?? EMPTY_FORM;
}

/** The server's form. See `EMPTY_FORM` for why the date is blank here. */
export function serverSeriesForm(): SeriesForm {
  return EMPTY_FORM;
}

/**
 * The series to inject, or an empty list when there is nothing usable yet.
 *
 * For the *send* path, which cannot await and must not branch on `status`: a
 * record that has not finished loading contributes nothing to this message, and
 * the next message gets it. `savedDocuments` makes the same trade.
 *
 * **Filtered here rather than at the call sites**, so "what counts as injectable"
 * has one definition. A series with no points is not injectable — its summary
 * would be an empty string, and an empty entry in the profile block is a line
 * telling the model about something that does not exist.
 */
export function savedSeries(agentId: string): readonly Series[] {
  const snapshot = states.get(agentId)?.snapshot;
  if (!snapshot || snapshot.status === "loading") return NO_SERIES;
  return snapshot.series.filter((series) => series.include && series.points.length > 0);
}

export function subscribeSeries(agentId: string, listener: () => void): () => void {
  const state = ensureState(agentId);
  state.listeners.add(listener);
  // Loading belongs here rather than in `seriesSnapshot` — see the file header.
  ensureLoaded(agentId);
  return () => {
    state.listeners.delete(listener);
  };
}

/* ============================================================================
   Writes
   ========================================================================= */

/**
 * Whether a mutation is allowed right now.
 *
 * Both refusals are silent: the panel is already gated on the same state, so a
 * mutation arriving here means something called us out of order, and dropping it
 * is the only safe answer. Writing over a record we have not loaded yet is
 * precisely how a slow read loses measurements the user took, and this check
 * living here is what stops the UI from getting it wrong.
 */
function writable(state: AgentState): boolean {
  if (state.snapshot.status === "loading") return false;
  // The store opened but could not be read: points may exist that we have never
  // seen, so the record is shown but not changed.
  if (state.snapshot.status === "session-only" && !state.snapshot.editable) return false;
  return true;
}

/**
 * The error to hand back when a mutation is refused, or `null` when it may
 * proceed. Returns the snapshot's **own** error rather than a fresh one — the
 * panel is already showing the right words for whichever case applies, and a
 * second message here would be a second chance to describe the wrong one.
 */
function refusal(state: AgentState): AppError | null {
  if (writable(state)) return null;
  if (state.snapshot.status === "session-only") return state.snapshot.error;
  // Still loading. Unreachable through the panel, which is gated on the same
  // state; a caller that got here called us out of order.
  return appError("STORAGE_UNAVAILABLE");
}

function queueWrite(agentId: string): void {
  const state = ensureState(agentId);
  // Session-only never persists, and a failed store is not retried per click.
  if (state.snapshot.status !== "ready" || state.storageFailed) return;
  void flush(agentId);
}

/**
 * Writes the record, with the re-entrancy loop and **no delay**.
 *
 * The loop is not optional: two clicks in quick succession would otherwise have
 * the second return early on `writing` and leave the first write's payload as the
 * last thing on disk. `dirty` is what makes the second one land. There is no
 * timer because every caller is a user action, not a streamed token.
 */
async function flush(agentId: string): Promise<void> {
  const state = ensureState(agentId);
  if (state.writing) {
    state.dirty = true;
    return;
  }
  state.writing = true;

  for (;;) {
    state.dirty = false;
    const series = [...state.series];

    try {
      const db = await openDatabase();
      await writeRecord(db, {
        agentId,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: Date.now(),
        series,
      });
    } catch (err) {
      state.writing = false;
      state.dirty = false;
      state.storageFailed = true;
      if (state.snapshot.status === "ready") {
        state.snapshot = {
          status: "ready",
          series: state.snapshot.series,
          saveError: appError("STORAGE_WRITE_FAILED", err instanceof Error ? err.message : String(err)),
        };
      }
      emit(agentId);
      return;
    }

    if (!state.dirty) break;
  }

  state.writing = false;
}

/**
 * The tail every content mutation shares: adopt, publish, schedule.
 *
 * **`summaryChars` is recomputed here and nowhere else**, which is what makes the
 * stored number trustworthy: there is exactly one line that writes a series into
 * the list, so there is exactly one place a recompute could be forgotten, and
 * `verify-series.mts` drives every mutation path and checks the result against a
 * fresh computation rather than against the stored field.
 */
function commit(agentId: string, state: AgentState, series: Series[]): void {
  state.series = series.map((entry) => ({ ...entry, summaryChars: seriesSummaryChars(entry) }));
  state.dirty = true;
  transition(state);
  emit(agentId);
  queueWrite(agentId);
}

/**
 * A fresh series id.
 *
 * `randomUUID` when the origin is secure, which it is for the deployed site and
 * for `localhost`. Random rather than a counter: a counter resets on reload and
 * would collide with a stored series, and the id is the React key and the target
 * of every mutation.
 */
export function newSeriesId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through — some restricted modes throw on access.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Starts a series, if there is room and the suggestion is not already taken.
 *
 * `name` and `unit` are supplied by the caller — copied from a suggestion or
 * typed by the user — and are stored, so the record stops depending on the config
 * the moment it exists. Both calls to `canAddSeries`' refusals are reported as
 * `SERIES_FULL`, which is a state rather than a fault: the add control stays
 * visible and the message says which limit was reached.
 */
export function addSeries(
  agentId: string,
  input: { name: string; unit: string; metricKey: string | null },
): SeriesResult & { id?: string } {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  const room = canAddSeries(state.series, input.metricKey);
  if (!room.ok) {
    // One code, two sentences — see `seriesFullError`. The `detail` differs so
    // the debug drawer says which rule fired rather than always claiming the
    // ceiling, which for a duplicate would send a reader looking for a full list.
    return {
      ok: false,
      error:
        room.reason === "full"
          ? seriesFullError(room.limit)
          : seriesFullError(MAX_SERIES_PER_AGENT, room.existingName),
    };
  }

  const id = newSeriesId();
  const series: Series = {
    id,
    name: input.name,
    unit: input.unit,
    metricKey: input.metricKey,
    include: true,
    points: [],
    summaryChars: 0,
  };

  // A new series becomes the selected one, on the grounds that it was just
  // created: leaving the chart on something else would look like the tap failed.
  state.form = Object.freeze({ ...state.form, selectedId: id, value: "", note: "" });
  commit(agentId, state, [...state.series, series]);
  return { ok: true, id };
}

/**
 * Turns one series' per-message summary on or off.
 *
 * Takes the value, not a toggle, for `setDocumentIncluded`'s reason: a toggle
 * applied twice — a double click, a re-delivered event — puts the series back
 * where it started, and the cost line is the only evidence, showing the original
 * number.
 */
export function setSeriesIncluded(agentId: string, seriesId: string, include: boolean): SeriesResult {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  const index = state.series.findIndex((entry) => entry.id === seriesId);
  // Already absent: deleted from another tab. The caller wanted it not-included
  // and it is not there at all, so this is not an error to report.
  if (index === -1) return { ok: true };

  const current = state.series[index];
  if (!current || current.include === include) return { ok: true };

  const next = [...state.series];
  next[index] = { ...current, include };
  commit(agentId, state, next);
  return { ok: true };
}

/**
 * The 删除 action for one series. Removes it and nothing else.
 *
 * Deliberately *not* wired to 清空对话, for the 资料夹's reason: a record outlives
 * the conversation it was built in, which is the whole point of it.
 */
export function removeSeries(agentId: string, seriesId: string): SeriesResult {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  const next = state.series.filter((entry) => entry.id !== seriesId);
  if (next.length === state.series.length) return { ok: true };

  // Clear the selection if it pointed here, so the chart does not render a series
  // that no longer exists — and clear the draft's series binding with it, or the
  // next 记一笔 would address a deleted id.
  if (state.form.selectedId === seriesId) {
    state.form = Object.freeze({ ...state.form, selectedId: null, value: "", note: "" });
  }
  commit(agentId, state, next);
  return { ok: true };
}

/**
 * Logs one value — **replacing** the point already on that date, if there is one.
 *
 * **The replace is the rule, not an accident.** A series is one value per day, and
 * a second entry for a date is a correction: the user weighed themselves again,
 * or mistyped. Appending would draw a vertical segment between two values that
 * were never both true on that day, and there would be no way to say which one is
 * real. So the panel says 「覆盖」 on the button when the date is taken, and this
 * function makes that literal.
 *
 * The ceiling is re-checked here even though the panel disables its control at
 * the ceiling, for the same reason `writable` is: the check that keeps the rule
 * true belongs next to the write. `canAddPoint` permits a date that is already
 * present at the ceiling, because re-logging does not grow the series.
 */
export function logSeriesPoint(
  agentId: string,
  seriesId: string,
  point: SeriesPoint,
): SeriesResult {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  const index = state.series.findIndex((entry) => entry.id === seriesId);
  if (index === -1) return { ok: true };

  const current = state.series[index];
  if (!current) return { ok: true };

  if (!isUsablePoint(point)) return { ok: false, error: appError("STORAGE_WRITE_FAILED", "rejected point") };

  const room = canAddPoint(current, point.date);
  if (!room.ok) return { ok: false, error: pointsFullError(room.limit) };

  const points = current.points.filter((existing) => existing.date !== point.date);
  points.push(point);
  // Ascending by date. Lexicographic is chronological because every stored date
  // is normalised — see `isUsableDate`.
  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const next = [...state.series];
  next[index] = { ...current, points };
  commit(agentId, state, next);
  return { ok: true };
}

/**
 * Removes one point.
 *
 * **This exists, and the design review argued it should not.** The objection was
 * that overwriting a date is enough, since a wrong value can be corrected by
 * logging the date again. It is not enough: overwriting fixes the *value* and
 * leaves the *date*, so a point recorded against the wrong day distorts the chart
 * permanently and the only remedy would be deleting the whole series. A
 * mis-dated point is at least as likely as a mis-typed one — the date field
 * defaults to today and is the field people forget to change.
 */
export function removeSeriesPoint(agentId: string, seriesId: string, date: string): SeriesResult {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  const index = state.series.findIndex((entry) => entry.id === seriesId);
  if (index === -1) return { ok: true };

  const current = state.series[index];
  if (!current) return { ok: true };

  const points = current.points.filter((point) => point.date !== date);
  if (points.length === current.points.length) return { ok: true };

  const next = [...state.series];
  next[index] = { ...current, points };
  commit(agentId, state, next);
  return { ok: true };
}

/* ============================================================================
   The draft — a write to module state, never to the record
   ========================================================================= */

/**
 * Replaces part of the entry form.
 *
 * **Selecting a different series clears the half-typed value and note but keeps
 * the date.** The value belongs to the series that was selected when it was
 * typed — carrying 「62.5」 from 体重 into 睡眠时长 would be a silent unit change,
 * and the user would press 记一笔 on a number they did not mean for that series.
 * The date usually does carry over, because someone logging two metrics for today
 * means today for both.
 *
 * Emits, so both mounted copies re-render; does **not** commit, so nothing is
 * written and `seriesSnapshot`'s identity is untouched. That split is the whole
 * design — see `SeriesForm`.
 */
export function setSeriesForm(agentId: string, patch: Partial<SeriesForm>): void {
  const state = ensureState(agentId);
  const selecting = patch.selectedId !== undefined && patch.selectedId !== state.form.selectedId;

  state.form = Object.freeze({
    ...state.form,
    ...patch,
    ...(selecting ? { value: "", note: "" } : {}),
  });
  emit(agentId);
}

/**
 * Re-arms a failed store after an explicit user retry. The only path that clears
 * `storageFailed`.
 */
export function retrySeriesSave(agentId: string): void {
  const state = states.get(agentId);
  if (!state || state.snapshot.status !== "ready") return;
  state.storageFailed = false;
  if (state.snapshot.saveError !== null) {
    state.snapshot = { status: "ready", series: state.snapshot.series, saveError: null };
    emit(agentId);
  }
  void flush(agentId);
}
