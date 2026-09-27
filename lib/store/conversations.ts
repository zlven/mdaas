/**
 * The conversation store — docs/01_PRD.md §5, docs/02_TECH_SPEC.md §9, §12
 *
 * §5 requires the transcript to live in the browser, and 06_ACCEPTANCE.md D7
 * requires it to survive a reload. Before this file the workspace's `messages`
 * was a bare `useState`, so a refresh in front of an audience erased the
 * conversation — the demo's most reproducible failure.
 *
 * One conversation per agent, keyed by agent id and nothing else. There is no
 * cursor, no unfiltered read and no cross-agent lookup anywhere in this file, so
 * reading a second agent's transcript means *adding* a call a reviewer will see
 * rather than passing a different argument (06_ACCEPTANCE.md I10). §5's
 * multi-conversation list is deliberately **not** here: this closes "the current
 * conversation survives a refresh" and nothing more.
 *
 * The same synchronous-snapshot / asynchronous-storage split as `memory.ts` and
 * `workflow-runs.ts`, for the same two reasons: `useSyncExternalStore`'s
 * `getSnapshot` runs during render and so may not start a side effect, and a
 * `loading` snapshot with no `messages` property is what stops a saved
 * conversation from flashing as empty for one frame — which reads as data loss.
 *
 * **Writes are coalesced; only writes.** `setConversation` is called once per
 * streamed token, because that is what makes the answer appear as it is written.
 * Serialising the whole transcript per token would not, so the store updates
 * module state and notifies React on every call and schedules at most one
 * IndexedDB write per second. Message boundaries — a turn starting, a stream
 * ending — pass `"immediate"`, because those are the moments a reload has to
 * see correctly.
 *
 * There is no length cap. A cap would mean silently truncating the top of a long
 * conversation on reload, which is a worse surprise than the storage cost, and
 * `01_PRD.md` §2 puts conversation management out of scope.
 */

import type { ChatMessage } from "@/lib/llm/types";

const DB_NAME = "mdaas.conversations";
const DB_VERSION = 1;
const STORE = "messages";

/**
 * Stamped on every record and re-checked on every read.
 *
 * A record written by a future version may mean something different by the same
 * key, and there is nothing to migrate it from — the transcript's only source is
 * the conversation that produced it. Discarded, per §9.
 */
const SCHEMA_VERSION = 1;

const COALESCE_MS = 1000;

export type ConversationSnapshot =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly messages: readonly ChatMessage[];
      /**
       * True when the conversation is on screen but is not reaching storage —
       * the next reload will not have it. Surfaced rather than swallowed,
       * because "it will be here when you come back" is the entire promise.
       */
      readonly saveFailed: boolean;
    };

interface ConversationRecord {
  agentId: string;
  schemaVersion: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface AgentState {
  snapshot: ConversationSnapshot;
  messages: readonly ChatMessage[];
  loaded: boolean;
  loading: boolean;
  storageFailed: boolean;
  writing: boolean;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  readonly listeners: Set<() => void>;
}

const states = new Map<string, AgentState>();

/** Shared by every agent that is still loading. Safe because it carries no data. */
const LOADING: ConversationSnapshot = Object.freeze({ status: "loading" });

/** The one empty transcript, so a cleared conversation is a stable reference. */
const EMPTY: readonly ChatMessage[] = Object.freeze([]);

function newState(): AgentState {
  return {
    snapshot: LOADING,
    messages: EMPTY,
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

function publish(agentId: string, state: AgentState, messages: readonly ChatMessage[], saveFailed?: boolean): void {
  const failed = saveFailed ?? (state.snapshot.status === "ready" && state.snapshot.saveFailed);
  state.messages = messages;
  state.snapshot = { status: "ready", messages, saveFailed: failed };
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

function readRecord(db: IDBDatabase, agentId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readonly");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const request = tx.objectStore(STORE).get(agentId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("conversation read failed"));
  });
}

function writeRecord(db: IDBDatabase, record: ConversationRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    tx.objectStore(STORE).put(record);
    // `oncomplete`, not the request's `onsuccess`: a request that succeeded
    // inside a transaction that later aborted has not been written.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("conversation write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("conversation write aborted"));
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
    tx.onerror = () => reject(tx.error ?? new Error("conversation delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("conversation delete aborted"));
  });
}

/**
 * Shape, not identity. Every stored turn must be a `ChatMessage`, because these
 * strings are fed straight back into `messages:` on the next turn — a record
 * whose entries are not messages would be sent to the provider as-is.
 */
function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<ChatMessage>;
  return (message.role === "user" || message.role === "assistant") && typeof message.content === "string";
}

function isUsableRecord(value: unknown): value is ConversationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ConversationRecord>;
  return (
    record.schemaVersion === SCHEMA_VERSION &&
    typeof record.updatedAt === "number" &&
    Array.isArray(record.messages) &&
    record.messages.every(isMessage)
  );
}

async function readStoredMessages(agentId: string): Promise<readonly ChatMessage[]> {
  const db = await openDatabase();
  const raw = await readRecord(db, agentId);

  if (raw === undefined || raw === null) return EMPTY;

  if (!isUsableRecord(raw)) {
    try {
      await deleteRecord(db, agentId);
    } catch {
      // Already unusable; the read below returns an empty transcript either way.
    }
    return EMPTY;
  }

  // Copied rather than handed out, so a later `setConversation` cannot mutate
  // what the snapshot is still pointing at.
  return raw.messages.map((message) => ({ role: message.role, content: message.content }));
}

/* ============================================================================
   Loading
   ========================================================================= */

function ensureLoaded(agentId: string): void {
  const state = ensureState(agentId);
  if (state.loaded || state.loading) return;
  state.loading = true;

  void readStoredMessages(agentId)
    .then((messages) => {
      const current = ensureState(agentId);
      current.loaded = true;
      current.loading = false;
      publish(agentId, current, messages, false);
    })
    .catch(() => {
      // Marked here rather than at the write, so a transcript we could not read
      // is never written over. The conversation still works this session.
      const current = ensureState(agentId);
      current.loaded = true;
      current.loading = false;
      current.storageFailed = true;
      publish(agentId, current, EMPTY, true);
    });
}

/* ============================================================================
   Public read surface
   ========================================================================= */

/** The synchronous snapshot. Reads module state and nothing else. */
export function conversationSnapshot(agentId: string): ConversationSnapshot {
  return states.get(agentId)?.snapshot ?? LOADING;
}

/**
 * The server's value, for `useSyncExternalStore`'s third argument. There is no
 * IndexedDB on the server, so the prerendered HTML shows the loading state and
 * React replaces it as soon as it is listening.
 */
export function serverConversationSnapshot(): ConversationSnapshot {
  return LOADING;
}

export function subscribeConversation(agentId: string, listener: () => void): () => void {
  const state = ensureState(agentId);
  state.listeners.add(listener);
  // Loading belongs here rather than in `conversationSnapshot` — see the header.
  ensureLoaded(agentId);
  return () => {
    state.listeners.delete(listener);
  };
}

/* ============================================================================
   Writes
   ========================================================================= */

/** `"immediate"` at a message boundary, `"coalesced"` for streamed text. */
export type CommitMode = "immediate" | "coalesced";

export function setConversation(agentId: string, messages: readonly ChatMessage[], mode: CommitMode): void {
  const state = ensureState(agentId);
  publish(agentId, state, messages);

  // Nothing is persisted before the read settles: writing now would put this
  // conversation over a transcript we have not seen yet.
  if (!state.loaded || state.storageFailed) return;

  if (mode === "immediate") {
    cancelTimer(state);
    void flush(agentId);
    return;
  }

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
    // Snapshot for this attempt; a token arriving during the await replaces
    // `state.messages` and sets `dirty`, which the loop picks up.
    const messages = state.messages;

    try {
      const db = await openDatabase();
      // An empty transcript deletes rather than stores. `clearConversation`
      // reaches storage through here, and a stored `[]` would leave a record
      // whose only content is the fact that it was emptied.
      if (messages.length === 0) {
        await deleteRecord(db, agentId);
      } else {
        await writeRecord(db, {
          agentId,
          schemaVersion: SCHEMA_VERSION,
          updatedAt: Date.now(),
          // A plain array: IndexedDB structured-clones what it is given, and a
          // readonly type is a compile-time idea with no runtime shape.
          messages: [...messages],
        });
      }
    } catch {
      state.writing = false;
      state.dirty = false;
      state.storageFailed = true;
      publish(agentId, state, state.messages, true);
      return;
    }

    if (!state.dirty) break;
  }

  state.writing = false;
}

/** The 清空对话 action. Removes the record rather than storing an empty list. */
export function clearConversation(agentId: string): void {
  const state = ensureState(agentId);
  cancelTimer(state);
  publish(agentId, state, EMPTY);
  if (!state.loaded || state.storageFailed) return;
  void flush(agentId);
}
