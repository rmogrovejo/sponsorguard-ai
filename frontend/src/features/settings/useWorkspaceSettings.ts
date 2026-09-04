import { useCallback, useEffect, useRef, useState } from "react";

import { applyDocumentAppearance, applyDocumentTitle, subscribePrefersDark } from "./applyWorkspaceAppearance";
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from "./settingsKeys";
import {
  canonicalSettingsPayload,
  defaultSettings,
  displayProductName,
  settingsFitsPersistence,
  type AppearanceSettings,
  type BrandSettings,
  type PreferenceSettings,
  type WorkspaceSettings,
} from "./settingsSchema";
import {
  clearSettings,
  loadSettings,
  saveSettings,
} from "./settingsStorage";
import type { MessageKey } from "../../i18n/translations";

export type SettingsUiStatus = "idle" | "saving" | "saved" | "unavailable";

export function settingsStatusLabel(status: SettingsUiStatus): string | null {
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved locally";
  if (status === "unavailable") return "Settings save unavailable";
  return null;
}

function hydrate(settings: WorkspaceSettings): WorkspaceSettings {
  applyDocumentAppearance(settings);
  applyDocumentTitle(displayProductName(settings.brand.productName));
  return settings;
}

export function useWorkspaceSettings() {
  const loaded = useRef(loadSettings());
  const settingsRef = useRef<WorkspaceSettings>(loaded.current.settings);
  const lastCanonical = useRef(canonicalSettingsPayload(loaded.current.settings));
  const timerRef = useRef<number | null>(null);

  const [settings, setSettings] = useState(() => hydrate(loaded.current.settings));
  const [status, setStatus] = useState<SettingsUiStatus>(() => {
    if (!loaded.current.storageAvailable) return "unavailable";
    if (loaded.current.restored) return "saved";
    return "idle";
  });
  const [invalidNotice, setInvalidNotice] = useState(loaded.current.invalidDiscarded);
  const [logoNotice, setLogoNotice] = useState<MessageKey | null>(null);

  const flush = useCallback((next: WorkspaceSettings) => {
    const result = saveSettings(next);
    if (result.status === "ok") {
      lastCanonical.current = canonicalSettingsPayload({
        ...next,
        savedAt: result.savedAt ?? next.savedAt,
      });
      setStatus("saved");
      return;
    }
    setStatus("unavailable");
  }, []);

  const schedule = useCallback(
    (next: WorkspaceSettings) => {
      settingsRef.current = next;
      setSettings(next);
      hydrate(next);
      const canonical = canonicalSettingsPayload(next);
      if (canonical === lastCanonical.current) return;
      setStatus((current) => (current === "unavailable" ? current : "saving"));
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        flush(settingsRef.current);
      }, SETTINGS_AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (settings.appearance.colorMode !== "system") return;
    return subscribePrefersDark((dark) => {
      applyDocumentAppearance(settingsRef.current, dark);
    });
  }, [settings.appearance.colorMode]);

  const updateBrand = useCallback(
    (brand: BrandSettings) => {
      const next = { ...settingsRef.current, brand };
      if (!settingsFitsPersistence(next)) {
        setLogoNotice("settings.logoOversized");
        return false;
      }
      setLogoNotice(null);
      schedule(next);
      return true;
    },
    [schedule],
  );

  const updateAppearance = useCallback(
    (appearance: AppearanceSettings) => {
      schedule({ ...settingsRef.current, appearance });
    },
    [schedule],
  );

  const updatePreferences = useCallback(
    (preferences: PreferenceSettings) => {
      schedule({ ...settingsRef.current, preferences });
    },
    [schedule],
  );

  const restoreDefaults = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = defaultSettings();
    settingsRef.current = next;
    lastCanonical.current = canonicalSettingsPayload(next);
    setLogoNotice(null);
    setInvalidNotice(false);
    setSettings(hydrate(next));
    const cleared = clearSettings();
    setStatus(cleared === "unavailable" ? "unavailable" : "idle");
  }, []);

  const dismissInvalidNotice = useCallback(() => {
    setInvalidNotice(false);
  }, []);

  const dismissLogoNotice = useCallback(() => {
    setLogoNotice(null);
  }, []);

  const reportLogoFailure = useCallback((message: MessageKey) => {
    setLogoNotice(message);
  }, []);

  return {
    settings,
    status,
    statusText: settingsStatusLabel(status),
    storageAvailable: loaded.current.storageAvailable,
    invalidNotice,
    logoNotice,
    updateBrand,
    updateAppearance,
    updatePreferences,
    restoreDefaults,
    dismissInvalidNotice,
    dismissLogoNotice,
    reportLogoFailure,
  };
}
