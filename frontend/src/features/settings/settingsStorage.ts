import { SETTINGS_STORAGE_KEY } from "./settingsKeys";
import {
  canonicalSettingsPayload,
  defaultSettings,
  parseWorkspaceSettings,
  settingsFitsPersistence,
  type WorkspaceSettings,
} from "./settingsSchema";

export type SettingsStorageStatus = "ok" | "unavailable" | "too_large";

export interface SettingsLoadResult {
  settings: WorkspaceSettings;
  restored: boolean;
  invalidDiscarded: boolean;
  storageAvailable: boolean;
}

export interface SettingsSaveResult {
  status: SettingsStorageStatus;
  savedAt: string | null;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(store: Storage | null = browserStorage()): SettingsLoadResult {
  if (store === null) {
    return {
      settings: defaultSettings(),
      restored: false,
      invalidDiscarded: false,
      storageAvailable: false,
    };
  }
  let raw: string | null;
  try {
    raw = store.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return {
      settings: defaultSettings(),
      restored: false,
      invalidDiscarded: false,
      storageAvailable: false,
    };
  }
  if (raw === null || raw === "") {
    return {
      settings: defaultSettings(),
      restored: false,
      invalidDiscarded: false,
      storageAvailable: true,
    };
  }
  const parsed = parseWorkspaceSettings(raw);
  if (typeof parsed === "string") {
    try {
      store.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Best-effort quarantine. Draft storage is not touched.
    }
    return {
      settings: defaultSettings(),
      restored: false,
      invalidDiscarded: true,
      storageAvailable: true,
    };
  }
  return {
    settings: parsed,
    restored: true,
    invalidDiscarded: false,
    storageAvailable: true,
  };
}

export function saveSettings(
  settings: WorkspaceSettings,
  store: Storage | null = browserStorage(),
): SettingsSaveResult {
  if (store === null) {
    return { status: "unavailable", savedAt: null };
  }
  if (!settingsFitsPersistence(settings)) {
    return { status: "too_large", savedAt: null };
  }
  const record: WorkspaceSettings = {
    ...settings,
    version: 1,
    savedAt: new Date().toISOString(),
  };
  try {
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(record));
    return { status: "ok", savedAt: record.savedAt };
  } catch {
    return { status: "unavailable", savedAt: null };
  }
}

export function clearSettings(store: Storage | null = browserStorage()): SettingsStorageStatus {
  if (store === null) return "unavailable";
  try {
    store.removeItem(SETTINGS_STORAGE_KEY);
    return "ok";
  } catch {
    return "unavailable";
  }
}

export function storedSettingsCanonical(store: Storage | null = browserStorage()): string | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseWorkspaceSettings(raw);
    if (typeof parsed === "string") return null;
    return canonicalSettingsPayload(parsed);
  } catch {
    return null;
  }
}
