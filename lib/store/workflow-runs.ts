/**
 * The workflow run store — docs/02_TECH_SPEC.md §9, §12
 *
 * One of §12's three migration interfaces (with `memory.ts` and the retriever),
 * so the usual rule is inverted: moving to another backend means replacing this
 * file, not chasing its call sites. No IndexedDB type appears in the exported
 * surface.
 *
 * **One run per agent, and the newest replaces it.** §9's storage rule is "on
 * mismatch, discard rather than attempt migration. This is a demo." There is no
 * history, no list, and no cross-agent read — every function here takes exactly
 * one `agentId` and touches exactly that key, so reading a second agent's run
 * means *adding* a call a reviewer will see rather than passing a different
 * argument (06_ACCEPTANCE.md I10).
 *
 * Three things are harder than they look:
 *
 *   1. **`useSyncExternalStore` needs a synchronous snapshot and IndexedDB is
 *      asynchronous.** `runSnapshot` reads module state and never touches the
 *      database; loading is started by `subscribeRun`, never by the snapshot,
 *      because `getSnapshot` runs during render where a side effect is doubled
 *      by StrictMode and dropped by a concurrent render. Same split as
 *      `memory.ts`, for the same reason.
 *   2. **`restore` runs at load, and only at load.** A run stored as `running`
 *      means the page went away mid-step; there is no live request to resume, so
 *      it is settled as `aborted` with the interrupted step marked failed and
 *      every finished step's text intact (F6). Doing this in the component
 *      instead would make it a render-time decision that runs twice under
 *      StrictMode.
 *   3. **Writes are coalesced, and only writes.** A token arriving calls
 *      `commitRun(…, "coalesced")`, which updates module state and notifies
 *      React immediately — the step renders as it is written, exactly as a chat
 *      answer does — and schedules at most one IndexedDB write per second. A
 *      seven-step run produces tens of thousands of tokens; serialising the run
 *      per token would jank a mid-range phone for no visible benefit, because a
 *      one-second-stale partial is indistinguishable from an exact one. Step
 *      boundaries pass `"immediate"`: those are few, and each is a state the
 *      user must see correctly after a reload.
 *
 * A failed read is not a failed write waiting to happen. If a record exists that
 * we could not read, we do not write over it — the run stays in memory for this
 * session and `saveFailed` says so, rather than silently destroying the previous
 * one.
 */

import type { AppError } from "@/lib/llm/errors";
import {
  RUN_SCHEMA_VERSION,
  isUsableRunRecord,
  restore,
  type WorkflowRunRecord,
} from "@/lib/workflow/run";
import type { WorkflowRun } from "@/lib/workflow/types";

const DB_NAME = "mdaas.workflow";
const DB_VERSION = 1;
const STORE = "runs";

/**
 * How long a coalesced write may lag the newest token.
 *
 * One second is chosen against the frame budget, not against durability: the
 * worst case is that a reload loses the last second of a step that is still
 * running, and that step is about to be marked failed by `restore` anyway.
 */
const COALESCE_MS = 1000;

export type RunSnapshot =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      /** `null` when this agent has no run — cleared, or never started one. */
      readonly run: WorkflowRun | null;
      /**
       * True when the run is live on screen but is not reaching storage. The
       * run still works; it just will not survive a reload, and the user is
       * entitled to know that before they rely on it.
       */
      readonly saveFailed: boolean;
      /**
       * A non-fatal problem with the run — a knowledge base that would not
       * load. Reported once, alongside the run, and **deliberately not part of
       * `WorkflowRun`**: it describes this session's attempt, not the artefact,
       * and a run restored from storage must not resurrect last session's
       * warning about a knowledge base that loads fine now.
       */
      readonly notice: AppError | null;
    };

interface AgentState {
  snapshot: RunSnapshot;
  run: WorkflowRun | null;
  loaded: boolean;
  loading: boolean;
  /** Sticky for the session. A read we could not perform is not retried per token. */
  storageFailed: boolean;
  writing: boolean;
  /** A newer run landed while a write was in flight. */
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  readonly listeners: Set<() => void>;
}

const states = new Map<string, AgentState>();

/**
 * One frozen object shared by every agent that is still loading.
 *
 * Sharing is safe precisely because `loading` carries no run — the same reason
 * `memory.ts` can do it. A fresh object per call would make React re-render
 * forever, and a `loading` snapshot that carried an empty run would make a saved
 * run flash as absent for a frame, which reads to the user as data loss.
 */
const LOADING: RunSnapshot = Object.freeze({ status: "loading" });

function newState(): AgentState {
  return {
    snapshot: LOADING,
    run: null,
    loaded: false,
    loading: false,
    storageFailed: false,
    writing: false,
    dirty: false,
    timer: null,
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

/**
 * Publishes a change, merging whatever the caller did not mention.
 *
 * A patch rather than positional arguments because `run: null` is a real value
 * ("this agent has no run"), so an absent field and a null one have to be told
 * apart — which `=== undefined` does and a default parameter cannot.
 */
function publish(
  agentId: string,
  state: AgentState,
  patch: { run?: WorkflowRun | null; saveFailed?: boolean; notice?: AppError | null },
): void {
  const current = state.snapshot.status === "ready" ? state.snapshot : null;
  const run = patch.run === undefined ? (current?.run ?? null) : patch.run;
  state.run = run;
  state.snapshot = {
    status: "ready",
    run,
    saveFailed: patch.saveFailed === undefined ? (current?.saveFailed ?? false) : patch.saveFailed,
    notice: patch.notice === undefined ? (current?.notice ?? null) : patch.notice,
  };
  emit(agentId);
}

/* ============================================================================
   IndexedDB
   ========================================================================= */

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
      // Private browsing and blocked-origin mode can throw from `open` itself
      // rather than delivering an error event.
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // `keyPath: agentId` is what makes the isolation structural: the store
        // is keyed by the one thing that scopes a run, so there is no "read
        // everything" operation to forget to filter.
        db.createObjectStore(STORE, { keyPath: "agentId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB.open failed"));
    // Another tab holding an older version open. Treated as unavailable rather
    // than waited on, because the tab cannot fix it and a hang is worse.
    request.onblocked = () => reject(new Error("indexedDB.open blocked by another tab"));
  });

  dbPromise = pending;
  void pending.catch(() => {
    if (dbPromise === pending) dbPromise = null;
  });

  return pending;
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
    request.onerror = () => reject(request.error ?? new Error("run read failed"));
  });
}

function writeRecord(db: IDBDatabase, record: WorkflowRunRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    tx.objectStore(STORE).put(record);

    // `oncomplete`, not the request's `onsuccess` — a request that succeeded
    // inside a transaction that later aborted has not been written, and
    // reporting success there is how a store claims to have saved something it
    // dropped.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("run write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("run write aborted"));
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
    tx.onerror = () => reject(tx.error ?? new Error("run delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("run delete aborted"));
  });
}

/**
 * Reads and settles one agent's stored run.
 *
 * Never deletes the store on an open failure: a version we do not understand is
 * exactly the case where a destructive recovery could destroy a run that a
 * newer build would have read fine.
 */
async function readStoredRun(agentId: string): Promise<WorkflowRun | null> {
  const db = await openDatabase();
  const raw = await readRecord(db, agentId);

  if (raw === undefined || raw === null) return null;

  if (!isUsableRunRecord(raw)) {
    // Written by another schema version, or by a build whose workflow set
    // differs. Dropped rather than guessed at.
    try {
      await deleteRecord(db, agentId);
    } catch {
      // A failed discard is not worth reporting: the record is already
      // unusable, and the read below returns "no run" either way.
    }
    return null;
  }

  // F6, and the only place it runs. A run stored as `running` means the page
  // went away underneath it.
  return restore(raw.run);
}

/* ============================================================================
   Loading
   ========================================================================= */

function ensureLoaded(agentId: string): void {
  const state = ensureState(agentId);
  if (state.loaded || state.loading) return;
  state.loading = true;

  void readStoredRun(agentId)
    .then((run) => {
      const current = ensureState(agentId);
      current.loaded = true;
      current.loading = false;
      publish(agentId, current, { run, saveFailed: false });
    })
    .catch(() => {
      // The run is still perfectly usable this session; it just is not being
      // read from or written to storage. Marking it here is what stops `flush`
      // from writing a fresh run over a record we could not read.
      const current = ensureState(agentId);
      current.loaded = true;
      current.loading = false;
      current.storageFailed = true;
      publish(agentId, current, { run: null, saveFailed: true });
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
 */
export function runSnapshot(agentId: string): RunSnapshot {
  return states.get(agentId)?.snapshot ?? LOADING;
}

/**
 * The server's value, for `useSyncExternalStore`'s third argument. There is no
 * IndexedDB on the server, so the prerendered HTML shows the loading state and
 * React replaces it as soon as it is listening.
 */
export function serverRunSnapshot(): RunSnapshot {
  return LOADING;
}

export function subscribeRun(agentId: string, listener: () => void): () => void {
  const state = ensureState(agentId);
  state.listeners.add(listener);
  // Loading belongs here rather than in `runSnapshot` — see the file header.
  ensureLoaded(agentId);
  return () => {
    state.listeners.delete(listener);
  };
}

/* ============================================================================
   Writes
   ========================================================================= */

/**
 * `"immediate"` at a step boundary, `"coalesced"` for streamed text.
 *
 * Required rather than defaulted: the choice of which is the whole write-timing
 * decision, and a default would let a call site inherit the wrong one silently.
 */
export type CommitMode = "immediate" | "coalesced";

export function commitRun(agentId: string, run: WorkflowRun, mode: CommitMode): void {
  const state = ensureState(agentId);
  publish(agentId, state, { run });

  // Nothing is persisted until the read has settled — writing now would put
  // this run over a record we have not seen yet.
  if (!state.loaded || state.storageFailed) return;

  if (mode === "immediate") {
    cancelTimer(state);
    void flush(agentId);
    return;
  }

  // Already scheduled. The timer writes whatever `state.run` is by then, which
  // is why this needs no pending-value slot.
  if (state.timer !== null) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    void flush(agentId);
  }, COALESCE_MS);
}

function cancelTimer(state: AgentState): void {
  if (state.timer === null) return;
  clearTimeout(state.timer);
  state.timer = null;
}

async function flush(agentId: string): Promise<void> {
  const state = ensureState(agentId);
  if (state.storageFailed) return;
  if (state.writing) {
    state.dirty = true;
    return;
  }
  state.writing = true;

  for (;;) {
    state.dirty = false;
    // Snapshot the run for this attempt; a token arriving during the await
    // replaces `state.run` and sets `dirty`, which the loop picks up.
    const run = state.run;

    try {
      const db = await openDatabase();
      if (run === null) await deleteRecord(db, agentId);
      else await writeRecord(db, { agentId, schemaVersion: RUN_SCHEMA_VERSION, updatedAt: Date.now(), run });
    } catch (err) {
      state.writing = false;
      state.dirty = false;
      state.storageFailed = true;
      // `detail` goes no further than this line. The only thing the user can act
      // on is "this run will not survive a reload", and `saveFailed` says it;
      // an `AppError` code here would be a field nothing switches on.
      void err;
      publish(agentId, state, { saveFailed: true });
      return;
    }

    if (!state.dirty) break;
  }

  state.writing = false;
}

/**
 * 「清空对话」 also drops the run, because a run belongs to the conversation it
 * was started from — leaving the artefact behind after clearing the thread that
 * produced it would be the same lie as keeping the attachments.
 */
/**
 * Sets the run's non-fatal notice, or clears it with `null`.
 *
 * Called by `lib/workflow/runner.ts` once, before the first step: a knowledge
 * base that would not load is a property of the whole run rather than of any one
 * step, so it is reported once and the run continues — the model is simply given
 * no reference material, which is the state every agent prompt's 「没有引用知识库」
 * clause is written for.
 */
export function setRunNotice(agentId: string, error: AppError | null): void {
  publish(agentId, ensureState(agentId), { notice: error });
}

export function clearRun(agentId: string): void {
  const state = ensureState(agentId);
  cancelTimer(state);
  publish(agentId, state, { run: null, notice: null });
  if (!state.loaded || state.storageFailed) return;
  void flush(agentId);
}
