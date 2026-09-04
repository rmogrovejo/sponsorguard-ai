import type { ShortFormPlatform } from "../../types/shortform";
import {
  DRAFT_STORAGE_KEY,
} from "./draftKeys";
import {
  canonicalDraftPayload,
  draftFitsPersistence,
  emptyDraft,
  isMeaningfulDraft,
  parseCreatorDraft,
  type CreatorDraft,
} from "./draftSchema";

export type DraftStorageStatus = "ok" | "unavailable" | "too_large";

export interface DraftLoadResult {
  draft: CreatorDraft;
  restored: boolean;
  invalidDiscarded: boolean;
  storageAvailable: boolean;
}

export interface DraftSaveResult {
  status: DraftStorageStatus;
  savedAt: string | null;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(
  store: Storage | null = browserStorage(),
  defaultPlatform: ShortFormPlatform = "tiktok",
): DraftLoadResult {
  if (store === null) {
    return {
      draft: emptyDraft(defaultPlatform),
      restored: false,
      invalidDiscarded: false,
      storageAvailable: false,
    };
  }
  let raw: string | null;
  try {
    raw = store.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return {
      draft: emptyDraft(defaultPlatform),
      restored: false,
      invalidDiscarded: false,
      storageAvailable: false,
    };
  }
  if (raw === null || raw === "") {
    return {
      draft: emptyDraft(defaultPlatform),
      restored: false,
      invalidDiscarded: false,
      storageAvailable: true,
    };
  }
  const parsed = parseCreatorDraft(raw);
  if (typeof parsed === "string") {
    try {
      store.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Quarantine is best-effort; the app still starts empty.
    }
    return {
      draft: emptyDraft(defaultPlatform),
      restored: false,
      invalidDiscarded: true,
      storageAvailable: true,
    };
  }
  return {
    draft: parsed,
    restored: isMeaningfulDraft(parsed, defaultPlatform),
    invalidDiscarded: false,
    storageAvailable: true,
  };
}

export function saveDraft(
  draft: CreatorDraft,
  store: Storage | null = browserStorage(),
): DraftSaveResult {
  if (store === null) {
    return { status: "unavailable", savedAt: null };
  }
  if (!draftFitsPersistence(draft)) {
    return { status: "too_large", savedAt: null };
  }
  const record: CreatorDraft = {
    ...draft,
    version: 1,
    savedAt: new Date().toISOString(),
  };
  try {
    store.setItem(DRAFT_STORAGE_KEY, JSON.stringify(record));
    return { status: "ok", savedAt: record.savedAt };
  } catch {
    return { status: "unavailable", savedAt: null };
  }
}

export function clearDraft(store: Storage | null = browserStorage()): DraftStorageStatus {
  if (store === null) return "unavailable";
  try {
    store.removeItem(DRAFT_STORAGE_KEY);
    return "ok";
  } catch {
    return "unavailable";
  }
}

export function storedCanonicalPayload(store: Storage | null = browserStorage()): string | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseCreatorDraft(raw);
    if (typeof parsed === "string") return null;
    return canonicalDraftPayload(parsed);
  } catch {
    return null;
  }
}
