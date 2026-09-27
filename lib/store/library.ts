/**
 * The per-agent 资料夹 store — docs/02_TECH_SPEC.md §8.7, §9
 *
 * One of §12's migration interfaces (`lib/store/*`), so the same rule holds as
 * for the other three: moving to another backend means replacing this file, not
 * chasing call sites. No IndexedDB type appears in the exported surface.
 *
 * Isolation is structural, exactly as in `memory.ts`: the only read names one
 * agent id and fetches that key. There is no unfiltered read, no cursor, and no
 * secondary lookup, so reading another agent's folder means *adding* a call a
 * reviewer will see (06_ACCEPTANCE.md I10).
 *
 * **Why this is not `memory.ts` with a different payload.** A profile is a
 * handful of short strings; a folder holds documents. That changes three things,
 * and each one is a decision rather than a copy:
 *
 *   1. **No write coalescing.** `conversations.ts` and `workflow-runs.ts` defer a
 *      write by a second because they are called once per streamed token, where
 *      per-token writes would be a snowstorm. Every mutation here is one user
 *      click, so the timer would buy nothing and cost something real: delete a
 *      document, reload within the second, and it is back. `conversations.ts`'s
 *      re-entrancy loop is kept; only the delay is dropped.
 *   2. **A read failure locks the panel rather than degrading to session-only.**
 *      A transcript is a byproduct of a conversation, and a profile is a few
 *      fields the user can retype in a minute. A saved document is the user's own
 *      material and typically the only copy in existence — so a store that opened
 *      but could not be read must not be written over. Hence `editable`, the same
 *      distinction `memory.ts` draws and for a sharper version of the same
 *      reason.
 *   3. **The list is one record per agent.** A per-document key would need a
 *      cursor to enumerate, which is the primitive the isolation argument above
 *      forbids — and it would let a partial write leave a document without the
 *      toggle that governs its cost.
 *
 * There is deliberately **no `clearLibrary`**. With a five-document ceiling,
 * per-document deletion covers every real intent, and "delete everything at
 * once" is a destructive action that deserves its own product decision rather
 * than arriving as a side effect of this file existing.
 */

import { canAddDocument, LIBRARY_INLINE_BUDGET_CHARS } from "@/lib/files/limits";
import type { LibraryDocument } from "@/lib/files/library";
import { appError, libraryFullError, type AppError } from "@/lib/llm/errors";

const DB_NAME = "mdaas.library";
const DB_VERSION = 1;
const STORE = "documents";

/**
 * Stamped on every record and re-checked on every read.
 *
 * Discard rather than migrate, per §9. A record written at a different inline
 * budget describes a split this build must not reuse, and re-splitting from it is
 * impossible by construction — the source text is not what is stored. So the
 * version is not bookkeeping here; it is the thing that makes storing the derived
 * split safe.
 */
const SCHEMA_VERSION = 1;

export type LibrarySnapshot =
  | { readonly status: "loading" }
  | {
      readonly status: "session-only";
      readonly documents: readonly LibraryDocument[];
      readonly error: AppError;
      /**
       * False when the store opened but the read failed: documents may exist that
       * we have not seen, and writing would destroy them unseen. True only when
       * storage is unusable outright, where nothing was ever persisted.
       */
      readonly editable: boolean;
    }
  | {
      readonly status: "ready";
      readonly documents: readonly LibraryDocument[];
      /** Set when a write did not commit. Cleared by an explicit retry. */
      readonly saveError: AppError | null;
    };

/**
 * What a mutation reports back. Callers render the message; the store words
 * nothing (`lib/llm/errors.ts` owns every user-facing string).
 */
export type LibraryResult = { ok: true } | { ok: false; error: AppError };

interface LibraryRecord {
  agentId: string;
  schemaVersion: number;
  updatedAt: number;
  documents: LibraryDocument[];
}

/* ============================================================================
   Module state — one entry per agent id, never "the current agent"
   ========================================================================= */

interface AgentState {
  snapshot: LibrarySnapshot;
  documents: LibraryDocument[];
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
const LOADING: LibrarySnapshot = Object.freeze({ status: "loading" });

/**
 * The frozen empty list, reused so `documents` has a stable identity.
 *
 * `useSyncExternalStore` compares snapshots by reference, and the writes below
 * hand out `Object.freeze([...])`-style arrays. An empty folder must always be
 * the *same* empty array, or a component reading it re-renders on every store
 * event — and `documentHits`' index cache is keyed on this array, so a new empty
 * array per call would rebuild an empty index on every message.
 */
const NO_DOCUMENTS: readonly LibraryDocument[] = Object.freeze([]);

function newState(): AgentState {
  return {
    snapshot: LOADING,
    documents: [],
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

function transition(state: AgentState): void {
  const current = state.snapshot;
  if (current.status === "loading") return;

  const documents = state.documents.length === 0 ? NO_DOCUMENTS : Object.freeze([...state.documents]);

  state.snapshot =
    current.status === "session-only"
      ? { status: "session-only", documents, error: current.error, editable: current.editable }
      : { status: "ready", documents, saveError: current.saveError };
}

/* ============================================================================
   Persistence lifetime

   Browser storage is not durable, and the folder is the first feature in this
   product that asks a user to rely on it. `persist()` asks the browser to exempt
   this origin from eviction under storage pressure.
   ========================================================================= */

let persistenceRequested = false;

/**
 * Asks the browser not to evict us, once per session.
 *
 * **The result is deliberately not surfaced, and that is the whole point of this
 * comment.** Chrome returns `false` on a first visit even when it is storing
 * everything normally — the request is evaluated against engagement heuristics
 * and gets granted later. Rendering "your browser declined to keep your files"
 * to that user would be false, alarming, and about a condition they cannot
 * change. Firefox and Safari either grant silently or do not implement it.
 *
 * So the request is made because it genuinely helps, and the honest statement
 * about durability is written unconditionally in the panel footer instead —
 * where it does not depend on an answer that does not mean what it looks like.
 *
 * Optional-chained throughout: `navigator.storage` is absent in some origins and
 * `persist` is absent in others, and a missing API here must not break the store.
 */
function requestPersistence(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => {
      // A refusal or a throw changes nothing we tell the user. See above.
    });
  } catch {
    // Some browsers throw on property access in restricted modes.
  }
}

/* ============================================================================
   IndexedDB — one database per store module, as the other three
   ========================================================================= */

/** Thrown from the read path. `editable` decides whether the panel may write. */
class LibraryStorageError extends Error {
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
        // `keyPath: agentId` is what makes the isolation structural: the store is
        // keyed by the one thing that scopes a folder, so there is no "read
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
 * True when one stored document is shaped the way everything downstream reads.
 *
 * Checked field by field rather than trusted, because this is the one record in
 * the product whose contents were produced at a *different budget* — a
 * `schemaVersion` match is the promise that the split is still the one this
 * build would make, and this check is what makes a hand-edited or half-written
 * record fail loudly instead of reaching `formatContext` as `undefined`.
 */
function isUsableDocument(value: unknown): value is LibraryDocument {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Partial<LibraryDocument>;
  if (typeof doc.id !== "string" || doc.id === "") return false;
  if (typeof doc.name !== "string") return false;
  if (typeof doc.savedAt !== "number") return false;
  if (typeof doc.include !== "boolean") return false;
  if (typeof doc.chars !== "number" || typeof doc.inlineChars !== "number") return false;
  if (typeof doc.truncated !== "boolean") return false;
  // The budget is a property of the record, not of the field — but a stored
  // inline pass over it means the record was written by a build with a larger
  // one, and injecting it would silently send more than this build's ceiling.
  if (doc.inlineChars > LIBRARY_INLINE_BUDGET_CHARS) return false;
  if (typeof doc.document !== "object" || doc.document === null) return false;
  if (!Array.isArray(doc.tail)) return false;
  return true;
}

/**
 * Exported so the schema gate is checkable from Node.
 *
 * This is the one decision in the store that cannot be exercised through the
 * public surface without a browser — injecting a bad record means writing to
 * IndexedDB — and it is the decision that makes storing the derived split
 * (`lib/files/library.ts`) safe. A version check that silently stopped rejecting
 * would surface as documents injected at the wrong budget, which is invisible
 * from the outside. So it is exported and asserted
 * (`scripts/verify-upload.mts`), rather than left unreachable.
 */
export function isUsableLibraryRecord(value: unknown): value is LibraryRecord & { documents: LibraryDocument[] } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<LibraryRecord>;
  if (record.schemaVersion !== SCHEMA_VERSION) return false;
  if (!Array.isArray(record.documents)) return false;
  return record.documents.every(isUsableDocument);
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
    request.onerror = () => reject(request.error ?? new Error("library read failed"));
  });
}

function writeRecord(db: IDBDatabase, record: LibraryRecord): Promise<void> {
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
    // inside a transaction that later aborts has not been written — and here
    // that would mean telling a user their document is saved when it is not.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("library write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("library write aborted"));
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
    tx.onerror = () => reject(tx.error ?? new Error("library delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("library delete aborted"));
  });
}

/**
 * Reads one agent's stored documents. Never deletes the database — an open
 * failure we do not understand is the one case where destructive recovery could
 * destroy data a newer version would have read fine.
 */
async function readStoredDocuments(agentId: string): Promise<LibraryDocument[]> {
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch (err) {
    // Nothing was ever persisted, so a session-only folder stays editable.
    throw new LibraryStorageError(err instanceof Error ? err.message : String(err), true);
  }

  let raw: unknown;
  try {
    raw = await readRecord(db, agentId);
  } catch (err) {
    // The store opened, so records may exist that we simply could not read.
    // Writing would overwrite them unseen.
    throw new LibraryStorageError(err instanceof Error ? err.message : String(err), false);
  }

  if (raw === undefined || raw === null) return [];

  if (!isUsableLibraryRecord(raw)) {
    // Written by another schema version, or corrupt. Dropped rather than guessed
    // at — the version exists precisely so this is a decision and not a gamble.
    try {
      await deleteRecord(db, agentId);
    } catch {
      // A failed discard is not worth reporting: the record is unusable either
      // way, and the read below returns an empty folder.
    }
    return [];
  }

  // Stored order is not relied on. Sorting here means the panel and the prompt
  // agree on one order regardless of what a previous build wrote.
  return [...raw.documents].sort(compareDocuments);
}

/* ============================================================================
   Ordering
   ========================================================================= */

/**
 * Oldest first, ties broken by id.
 *
 * **Ascending, so saving a document does not renumber the others.** These become
 * `[1]`…`[n]` in the reference block, and the panel's cost line counts them; a
 * newest-first order would shift every existing document's number each time one
 * is added, which reads as the assistant citing a different source than it did
 * last turn.
 *
 * The id tiebreak is not decoration: `Date.now()` has millisecond resolution and
 * two documents saved from one batch can share it, which would leave the order
 * to the sort implementation — stable in modern engines, but not something to
 * depend on for something the user can see.
 */
function compareDocuments(a: LibraryDocument, b: LibraryDocument): number {
  if (a.savedAt !== b.savedAt) return a.savedAt - b.savedAt;
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
    documents: NO_DOCUMENTS,
    error: appError(editable ? "STORAGE_UNAVAILABLE" : "STORAGE_READ_FAILED", detail),
    editable,
  };
  emit(agentId);
}

function ensureLoaded(agentId: string): void {
  const state = ensureState(agentId);
  if (state.loaded || state.loading) return;
  state.loading = true;

  // Fire-and-forget, and started here rather than in `librarySnapshot` for the
  // same reason loading is: `getSnapshot` runs during render.
  requestPersistence();

  void readStoredDocuments(agentId)
    .then((documents) => {
      const current = ensureState(agentId);
      current.documents = documents;
      current.loaded = true;
      current.loading = false;
      current.snapshot = {
        status: "ready",
        documents: documents.length === 0 ? NO_DOCUMENTS : Object.freeze([...documents]),
        saveError: null,
      };
      emit(agentId);
      // No mutation can have landed during the read: the write surface refuses to
      // touch a folder whose snapshot is still `loading`. Adopting the stored
      // documents wholesale is therefore safe.
    })
    .catch((err: unknown) => {
      applyLoadFailure(agentId, err, err instanceof LibraryStorageError ? err.editable : false);
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
export function librarySnapshot(agentId: string): LibrarySnapshot {
  return states.get(agentId)?.snapshot ?? LOADING;
}

/**
 * The server's value, for `useSyncExternalStore`'s third argument. There is no
 * `IndexedDB` on the server, so the prerendered HTML shows the loading state.
 */
export function serverLibrarySnapshot(): LibrarySnapshot {
  return LOADING;
}

/**
 * The documents to work with, or an empty list when there is nothing usable yet.
 *
 * For the *send* path, which cannot await and must not branch on `status`: a
 * folder that has not finished loading contributes nothing to this message, and
 * the next message gets it. Returning the empty list rather than the loading
 * union keeps that decision in one place instead of at each call site.
 */
export function savedDocuments(agentId: string): readonly LibraryDocument[] {
  const snapshot = states.get(agentId)?.snapshot;
  if (!snapshot || snapshot.status === "loading") return NO_DOCUMENTS;
  return snapshot.documents;
}

export function subscribeLibrary(agentId: string, listener: () => void): () => void {
  const state = ensureState(agentId);
  state.listeners.add(listener);
  // Loading belongs here rather than in `librarySnapshot` — see the file header.
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
 * is the only safe answer. Writing over a folder we have not loaded yet is
 * precisely how a slow read loses documents, and this check living here is what
 * stops the UI from getting it wrong.
 */
function writable(state: AgentState): boolean {
  if (state.snapshot.status === "loading") return false;
  // The store opened but could not be read: documents may exist that we have
  // never seen, so the folder is shown but not changed.
  if (state.snapshot.status === "session-only" && !state.snapshot.editable) return false;
  return true;
}

/**
 * The error to hand back when a mutation is refused, or `null` when it may
 * proceed.
 *
 * Returns the snapshot's **own** error rather than a fresh one. The two refusals
 * mean different things — "this browser cannot store anything" against "there may
 * be documents here we could not read, so do not overwrite them" — and the panel
 * is already showing the right words for whichever applies. Wording a second
 * message here would be a second chance to describe the wrong one, and a caller
 * that renders it would contradict the notice directly above it.
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
 * Writes the list, with `conversations.ts`'s re-entrancy loop and **no delay**.
 *
 * The loop is not optional: two clicks in quick succession would otherwise have
 * the second return early on `writing` and leave the first write's payload as the
 * last thing on disk. `dirty` is what makes the second one land.
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
    const documents = [...state.documents];

    try {
      const db = await openDatabase();
      await writeRecord(db, {
        agentId,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: Date.now(),
        documents,
      });
    } catch (err) {
      state.writing = false;
      state.dirty = false;
      state.storageFailed = true;
      if (state.snapshot.status === "ready") {
        state.snapshot = {
          status: "ready",
          documents: state.snapshot.documents,
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

/** The tail every mutation shares: adopt, publish, schedule. */
function commit(agentId: string, state: AgentState, documents: LibraryDocument[]): void {
  state.documents = documents;
  state.dirty = true;
  transition(state);
  emit(agentId);
  queueWrite(agentId);
}

/**
 * A fresh document id.
 *
 * `randomUUID` when the origin is secure, which it is for the deployed site and
 * for `localhost`. The fallback matters because the alternative is not "no id"
 * but a *colliding* one: ids are the chunk-id namespace and the React key, so two
 * documents sharing one would merge in the retrieval index and in the list. It is
 * therefore random rather than a counter, which would reset on reload.
 */
export function newDocumentId(): string {
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
 * Saves one document, if the folder has room.
 *
 * **Idempotent on the id: a document already present is left alone, not
 * replaced.** Replacing is the silent data loss this store is otherwise careful
 * about — and "it is already in the folder" is a true thing to report, because it
 * is. Ids come from `newDocumentId()` at the moment of saving, so a repeat with
 * the same id is a repeated call for the same document, which is exactly the case
 * where doing nothing is correct.
 *
 * The cap is re-checked here even though the panel disables its control at the
 * ceiling, for the same reason `writable` is: the check that keeps the rule true
 * belongs next to the write, not only in the view that usually respects it.
 */
export function addLibraryDocument(agentId: string, document: LibraryDocument): LibraryResult {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  if (state.documents.some((existing) => existing.id === document.id)) return { ok: true };

  const room = canAddDocument(state.documents);
  if (!room.ok) return { ok: false, error: libraryFullError(room.limit) };

  commit(agentId, state, [...state.documents, document].sort(compareDocuments));
  return { ok: true };
}

/**
 * Turns one document's per-message inclusion on or off.
 *
 * Takes the value, not a toggle. A toggle applied twice — a double click, a
 * re-delivered event — puts the document back where it started, and the user has
 * no way to tell that happened; the cost line would be the only evidence and it
 * would be showing the original number.
 */
export function setDocumentIncluded(agentId: string, docId: string, include: boolean): LibraryResult {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  const index = state.documents.findIndex((doc) => doc.id === docId);
  // Already absent: the document was deleted from another tab. Not an error to
  // report — the caller wanted it not-included and it is not there at all.
  if (index === -1) return { ok: true };

  const next = [...state.documents];
  const current = next[index];
  if (!current) return { ok: true };
  if (current.include === include) return { ok: true };

  next[index] = { ...current, include };
  commit(agentId, state, next);
  return { ok: true };
}

/**
 * The 删除 action. Removes the record for one document and nothing else.
 *
 * Deliberately *not* wired to 清空对话: a folder outlives the conversation it was
 * built in, which is the whole reason it exists. Deleting is always an explicit
 * action on one document.
 */
export function removeLibraryDocument(agentId: string, docId: string): LibraryResult {
  const state = ensureState(agentId);
  const refused = refusal(state);
  if (refused) return { ok: false, error: refused };

  const next = state.documents.filter((doc) => doc.id !== docId);
  if (next.length === state.documents.length) return { ok: true };

  commit(agentId, state, next);
  return { ok: true };
}

/**
 * Re-arms a failed store after an explicit user retry. The only path that clears
 * `storageFailed`.
 */
export function retryLibrarySave(agentId: string): void {
  const state = states.get(agentId);
  if (!state || state.snapshot.status !== "ready") return;
  state.storageFailed = false;
  if (state.snapshot.saveError !== null) {
    state.snapshot = { status: "ready", documents: state.snapshot.documents, saveError: null };
    emit(agentId);
  }
  void flush(agentId);
}
