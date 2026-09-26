/**
 * Provider settings — docs/02_TECH_SPEC.md §7, §9.
 *
 * The key lives in `localStorage` in the user's own browser and is sent only to
 * the provider the user chose. Three rules from §7 are enforced here:
 *
 *   - `maskKey` is the only way a key is ever rendered. It never returns the
 *     full value, so a caller cannot leak it by accident — there is no option to
 *     pass. §7 requires Settings to show `sk-…f3a2` and nothing more.
 *   - Nothing here logs. Not on read, not on write, not on a parse failure.
 *   - A corrupt value is dropped, not repaired. Half-parsed credentials are
 *     worse than absent ones: the user sees an empty form and retypes the key.
 *
 * The read is exposed in two forms. `readSettings()` is a one-shot for code that
 * already knows when it wants the value (the Settings form). `settingsSnapshot` /
 * `subscribeSettings` are the same value as an external store, because the
 * workspace has to *re-render* when the key's presence changes — and a store is
 * how React is told that without an effect that sets state, which would render
 * the wrong thing for one frame first.
 */

import type { ProviderId } from "@/lib/llm/types";

export interface ProviderSettings {
  providerId: ProviderId;
  apiKey: string;
  model: string;
  /** Endpoint for `compatible`. Empty for the three hosted providers. */
  baseUrl: string;
  /** The user's own forwarding proxy (05_API_SPEC.md §6). `compatible` only. */
  proxyUrl: string;
}

const STORAGE_KEY = "mdaas.settings.v1";

/** OpenAI is the default because its key format is the one people already have. */
export const DEFAULT_SETTINGS: ProviderSettings = {
  providerId: "openai",
  apiKey: "",
  model: "",
  baseUrl: "",
  proxyUrl: "",
};

const PROVIDER_IDS: ProviderId[] = ["openai", "anthropic", "google", "compatible"];

function isSettings(value: unknown): value is ProviderSettings {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<ProviderSettings>;
  return (
    typeof s.providerId === "string" &&
    PROVIDER_IDS.includes(s.providerId as ProviderId) &&
    typeof s.apiKey === "string" &&
    typeof s.model === "string" &&
    typeof s.baseUrl === "string" &&
    typeof s.proxyUrl === "string"
  );
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing, a blocked origin, or a quota error. None of them is
    // worth reporting to the user; an empty form is the correct result.
    return null;
  }
}

function parse(raw: string | null): ProviderSettings | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns null when nothing is stored, or when what is stored is not usable. */
export function readSettings(): ProviderSettings | null {
  if (typeof window === "undefined") return null;
  return parse(readRaw());
}

export function saveSettings(settings: ProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Nothing useful to do. The form still shows what the user typed, and the
    // next attempt may succeed.
  }
  emit();
}

/** The Delete key action in Settings (§8). Removes the whole record. */
export function clearSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // As above.
  }
  emit();
}

/**
 * `sk-…f3a2`. The maximum that may ever be shown (§7).
 *
 * A key too short to mask meaningfully is rendered as a bare ellipsis: showing
 * three leading and four trailing characters of an eight-character key would
 * display almost the whole thing.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") return "";
  if (trimmed.length <= 8) return "…";
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}

/**
 * Whether the workspace should offer an input at all.
 *
 * Only the two fields every provider needs are checked. The `compatible`
 * provider additionally needs a base URL, but that is the adapter's
 * NO_CREDENTIALS error to raise — it can say so precisely, and duplicating the
 * rule here would be a second place to keep in sync (02_TECH_SPEC.md §6.5).
 */
export function isConfigured(settings: ProviderSettings | null): boolean {
  if (!settings) return false;
  return settings.apiKey.trim() !== "" && settings.model.trim() !== "";
}

/* ============================================================================
   The store form

   `useSyncExternalStore` requires `getSnapshot` to return the *same reference*
   while nothing has changed — returning a fresh object each call makes React
   re-render forever. The cache is keyed on the raw string, so identity changes
   exactly when the stored value does.
   ========================================================================= */

let snapshot: ProviderSettings | null = null;
let snapshotRaw: string | null = null;
let primed = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Stable across calls until `localStorage` changes. */
export function settingsSnapshot(): ProviderSettings | null {
  if (typeof window === "undefined") return null;

  const raw = readRaw();
  if (!primed || raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshot = parse(raw);
    primed = true;
  }
  return snapshot;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);

  // A second tab is a real case — the Settings page open beside a workspace.
  // `storage` fires only in the tabs that did *not* write, which is exactly the
  // gap this fills; the writing tab is covered by `emit()` above.
  const onStorage = (event: StorageEvent) => {
    // `key === null` is `clear()`, which wipes this key too.
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
