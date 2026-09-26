/**
 * The per-agent profile store — docs/04_AGENT_SPEC.md §6, docs/02_TECH_SPEC.md §9
 *
 * One of §12's three migration interfaces (the others are `ModelGateway` and
 * `Retriever`), so the usual rule is inverted: moving to another backend means
 * replacing this file, not chasing its call sites. No IndexedDB type appears in
 * the exported surface.
 *
 * Isolation is a property of the code, not a discipline. Every read names one
 * agent id and fetches exactly that key — there is no unfiltered read, no
 * cursor, and no secondary lookup anywhere in this file, which is why grepping
 * it for the obvious cross-agent primitives returns nothing. Reading a second
 * agent's profile therefore means *adding* a call that a reviewer will see,
 * rather than passing a different argument (06_ACCEPTANCE.md I10). The same
 * trick as `retriever.ts`, which builds its URL from the id alone.
 *
 * Two things are harder than they look, and both have the same root:
 * `useSyncExternalStore` needs a **synchronous** snapshot and IndexedDB is
 * **asynchronous**.
 *
 *   1. `profileSnapshot` never touches IndexedDB. It reads module state. The
 *      async boundary is crossed only in `subscribeProfile` and the write path.
 *   2. Loading is started by `subscribeProfile`, never by `profileSnapshot`.
 *      `getSnapshot` runs during render, where a side effect is doubled by
 *      StrictMode and dropped by a concurrent render.
 *
 * `ProfileSnapshot` carries `loading` as a member with **no `fields` property**,
 * so "still reading" cannot be mistaken for "empty": that mistake is a compile
 * error rather than something a reviewer has to notice. It is the only way the
 * fix stays fixed. The bug it prevents — a saved profile flashing as empty for
 * one frame — reads to the user as data loss.
 */

import { appError, type AppError } from "@/lib/llm/errors";

const DB_NAME = "mdaas.memory";
const DB_VERSION = 1;
const STORE = "profile";

/**
 * Stamped on every record and re-checked on every read.
 *
 * A record written by a future version may mean something different by the same
 * key. Discarding it is the honest option: this is a user-authored profile with
 * no derivable source, so there is nothing to migrate it *from*.
 */
const SCHEMA_VERSION = 1;

export type ProfileFields = Readonly<Record<string, string>>;

export type ProfileSnapshot =
  | { readonly status: "loading" }
  | {
      readonly status: "session-only";
      readonly fields: ProfileFields;
      readonly error: AppError;
      /**
       * False when the store opened but the read failed — data may exist that we
       * have not seen, and writing over it would destroy it. True when storage
       * is unusable outright, because then nothing was ever persisted and there
       * is nothing to protect.
       */
      readonly editable: boolean;
    }
  | {
      readonly status: "ready";
      readonly fields: ProfileFields;
      /** Set when a write did not commit. Cleared by an explicit retry. */
      readonly saveError: AppError | null;
    };

interface ProfileRecord {
  agentId: string;
  schemaVersion: number;
  updatedAt: number;
  fields: Record<string, string>;
}

/* ============================================================================
   Module state

   One record per agent id — never "the current agent", which is the shape that
   lets data move between agents by accident.
   ========================================================================= */

interface AgentState {
  snapshot: ProfileSnapshot;
  fields: Record<string, string>;
  /** A load has finished, successfully or not. Failures are sticky — see below. */
  loaded: boolean;
  loading: boolean;
  /** Sticky for the session: once a write fails we stop retrying on every edit. */
  storageFailed: boolean;
  writing: boolean;
  /** An edit landed while a write was in flight. */
  dirty: boolean;
  readonly listeners: Set<() => void>;
}

const states = new Map<string, AgentState>();

/**
 * One frozen object shared by every agent that is still loading.
 *
 * Sharing is safe precisely because `loading` carries no data — the same reason
 * `settings.ts` can use a single frozen server snapshot. Returning a fresh
 * object per call would make React re-render forever.
 */
const LOADING: ProfileSnapshot = Object.freeze({ status: "loading" });

function newState(): AgentState {
  return {
    snapshot: LOADING,
    fields: {},
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

/**
 * Rebuilds the snapshot for a state transition. Called only when something
 * actually changed, so the returned reference is stable between changes.
 */
function transition(state: AgentState): void {
  const current = state.snapshot;
  // Nothing to publish while the read is still in flight. Callers are gated on
  // this too, so a `loading` snapshot here means there is genuinely nothing new.
  if (current.status === "loading") return;

  const fields = Object.freeze({ ...state.fields });

  state.snapshot =
    current.status === "session-only"
      ? { status: "session-only", fields, error: current.error, editable: current.editable }
      : { status: "ready", fields, saveError: current.saveError };
}

/* ============================================================================
   IndexedDB

   One database per store module rather than one shared `mdaas` database, so a
   future `conversations.ts` can bump its own version and reset itself without
   touching an upgrade handler that has to know about every store.
   ========================================================================= */

/** Thrown from the read path. `editable` decides whether the UI offers editing. */
class ProfileStorageError extends Error {
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
      // Private browsing and blocked-origin mode can throw from `open` itself
      // rather than delivering an error event.
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // `keyPath: agentId` is what makes the isolation structural: the store
        // is keyed by the one thing that scopes a profile, so there is no
        // "read everything" operation to forget to filter.
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
  // Not left cached: the state's `storageFailed` is what makes failure sticky,
  // not this cache. Clearing it keeps the error handled and lets an explicit
  // retry genuinely try again.
  void pending.catch(() => {
    if (dbPromise === pending) dbPromise = null;
  });

  return pending;
}

/**
 * True when the record is usable. Validation is on **shape**, not identity: the
 * `agentId` cannot disagree with itself, because the keyPath derives it from the
 * key we just looked up. A record from a future schema is the case that is
 * actually reachable, so that is the one checked.
 */
function isUsableRecord(value: unknown): value is ProfileRecord & { fields: Record<string, string> } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ProfileRecord>;
  if (record.schemaVersion !== SCHEMA_VERSION) return false;
  const fields = record.fields;
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return false;
  return Object.values(fields).every((entry) => typeof entry === "string");
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
    request.onerror = () => reject(request.error ?? new Error("profile read failed"));
  });
}

function writeRecord(db: IDBDatabase, record: ProfileRecord): Promise<void> {
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
    // inside a transaction that later aborts has not been written, and
    // reporting success there is how a store claims to have saved something it
    // dropped.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("profile write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("profile write aborted"));
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
    tx.onerror = () => reject(tx.error ?? new Error("profile delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("profile delete aborted"));
  });
}

/**
 * Reads one agent's stored fields.
 *
 * Never deletes the database. An open failure we do not understand is the one
 * case where a destructive recovery could destroy data that a newer version
 * would have read fine — so the profile degrades to the session instead.
 */
async function readStoredFields(agentId: string): Promise<Record<string, string>> {
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch (err) {
    // Nothing was ever persisted, so a session-only profile stays editable.
    throw new ProfileStorageError(err instanceof Error ? err.message : String(err), true);
  }

  let raw: unknown;
  try {
    raw = await readRecord(db, agentId);
  } catch (err) {
    // The store opened, so a record may exist that we simply could not read.
    // Editing would write over it unseen.
    throw new ProfileStorageError(err instanceof Error ? err.message : String(err), false);
  }

  if (raw === undefined || raw === null) return {};

  if (!isUsableRecord(raw)) {
    // Written by another schema version. Dropped rather than guessed at.
    try {
      await deleteRecord(db, agentId);
    } catch {
      // A failed discard is not worth reporting: the record is already unusable,
      // and the read below returns an empty profile either way.
    }
    return {};
  }

  return { ...raw.fields };
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
  // Two different failures wear the same shape. "Storage is switched off" and
  // "a record exists that we could not read" need different advice — the first
  // is session-only and editable, the second is neither — so they get different
  // wording rather than one message and a boolean the user never sees.
  state.snapshot = {
    status: "session-only",
    fields: Object.freeze({}),
    error: appError(editable ? "STORAGE_UNAVAILABLE" : "STORAGE_READ_FAILED", detail),
    editable,
  };
  emit(agentId);
}

function ensureLoaded(agentId: string): void {
  const state = ensureState(agentId);
  if (state.loaded || state.loading) return;
  state.loading = true;

  void readStoredFields(agentId)
    .then((fields) => {
      const current = ensureState(agentId);
      current.fields = fields;
      current.loaded = true;
      current.loading = false;
      current.snapshot = { status: "ready", fields: Object.freeze({ ...fields }), saveError: null };
      emit(agentId);
      // No edit can have landed during the read: the write surface refuses to
      // touch a profile whose snapshot is still `loading`. Adopting the stored
      // fields wholesale is therefore safe.
    })
    .catch((err: unknown) => {
      applyLoadFailure(agentId, err, err instanceof ProfileStorageError ? err.editable : false);
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
export function profileSnapshot(agentId: string): ProfileSnapshot {
  return states.get(agentId)?.snapshot ?? LOADING;
}

/**
 * The server's value, for `useSyncExternalStore`'s third argument.
 *
 * There is no `IndexedDB` on the server, so the prerendered HTML shows the
 * loading state and React replaces it as soon as it is listening. A single
 * module-level object, because React compares it across calls.
 */
export function serverProfileSnapshot(): ProfileSnapshot {
  return LOADING;
}

export function subscribeProfile(agentId: string, listener: () => void): () => void {
  const state = ensureState(agentId);
  state.listeners.add(listener);
  // Loading belongs here rather than in `profileSnapshot` — see the file header.
  ensureLoaded(agentId);
  return () => {
    state.listeners.delete(listener);
  };
}

/* ============================================================================
   Writes
   ========================================================================= */

function queueWrite(agentId: string): void {
  const state = ensureState(agentId);
  // Session-only never persists, and a failed store is not retried per keystroke
  // — storage failure is a property of the browser, not a transient network
  // moment, so retrying on every edit is a snowstorm that cannot succeed. The
  // user recovers with the retry control or a reload.
  if (state.snapshot.status !== "ready" || state.storageFailed) return;
  void flush(agentId);
}

async function flush(agentId: string): Promise<void> {
  const state = ensureState(agentId);
  if (state.writing) {
    state.dirty = true;
    return;
  }
  state.writing = true;

  for (;;) {
    state.dirty = false;
    // Snapshot the fields for this attempt; an edit during the await replaces
    // `state.fields` and sets `dirty`, which the loop picks up.
    const fields = { ...state.fields };

    try {
      const db = await openDatabase();
      await writeRecord(db, { agentId, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), fields });
    } catch (err) {
      state.writing = false;
      state.dirty = false;
      state.storageFailed = true;
      if (state.snapshot.status === "ready") {
        state.snapshot = {
          status: "ready",
          fields: state.snapshot.fields,
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
 * Sets one field. An empty value removes the key.
 *
 * Removing rather than storing `""` keeps one representation of "not answered":
 * otherwise the prompt would render `- 身高：` with nothing after it, and the
 * filled-field count would include fields the user cleared.
 */
export function setProfileField(agentId: string, key: string, value: string): void {
  const state = ensureState(agentId);
  // Nothing is editable before the read settles. Writing over a profile we have
  // not loaded yet is precisely how a slow read loses data, and the check lives
  // here so the UI cannot get it wrong.
  if (state.snapshot.status === "loading") return;
  // The store opened but could not be read: a record may exist that we have
  // never seen, so it is shown but not edited.
  if (state.snapshot.status === "session-only" && !state.snapshot.editable) return;

  const trimmed = value.trim();
  const next = { ...state.fields };
  if (trimmed === "") delete next[key];
  else next[key] = trimmed;

  state.fields = next;
  state.dirty = true;
  transition(state);
  emit(agentId);
  queueWrite(agentId);
}

/** The 清空档案 action. Clears the record; the user asked for it. */
export function clearProfile(agentId: string): void {
  const state = ensureState(agentId);
  if (state.snapshot.status === "loading") return;
  if (state.snapshot.status === "session-only" && !state.snapshot.editable) return;

  state.fields = {};
  state.dirty = true;
  transition(state);
  emit(agentId);
  queueWrite(agentId);
}

/**
 * Re-arms a failed store after an explicit user retry. The only path that
 * clears `storageFailed`.
 */
export function retryProfileSave(agentId: string): void {
  const state = states.get(agentId);
  if (!state || state.snapshot.status !== "ready") return;
  state.storageFailed = false;
  if (state.snapshot.saveError !== null) {
    state.snapshot = { status: "ready", fields: state.snapshot.fields, saveError: null };
    emit(agentId);
  }
  void flush(agentId);
}
