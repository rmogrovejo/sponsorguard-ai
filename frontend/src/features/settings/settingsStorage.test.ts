import { describe, expect, it, vi } from "vitest";

import { DRAFT_STORAGE_KEY } from "../persistence/draftKeys";
import { SETTINGS_STORAGE_KEY } from "./settingsKeys";
import { defaultSettings } from "./settingsSchema";
import { clearSettings, loadSettings, saveSettings } from "./settingsStorage";
import { sampleSettings, writeSettings } from "./settingsTestFixtures";

describe("settings storage", () => {
  it("saves and loads valid settings without touching the draft key", () => {
    const settings = sampleSettings();
    expect(saveSettings(settings).status).toBe("ok");
    const loaded = loadSettings();
    expect(loaded.restored).toBe(true);
    expect(loaded.settings.brand.productName).toBe("StudioPreflight");
    expect(loaded.settings.appearance.accent).toBe("olive");
    expect(loaded.settings.preferences.defaultPlatform).toBe("instagram_reels");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain("StudioPreflight");
  });

  it("returns defaults when nothing is stored", () => {
    const loaded = loadSettings();
    expect(loaded.restored).toBe(false);
    expect(loaded.settings.brand.productName).toBe(defaultSettings().brand.productName);
    expect(loaded.settings.appearance.accent).toBe("terracotta");
  });

  it("discards invalid JSON and falls back to defaults", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, "{broken");
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "keep-me");
    const loaded = loadSettings();
    expect(loaded.invalidDiscarded).toBe(true);
    expect(loaded.settings.appearance.accent).toBe("terracotta");
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe("keep-me");
  });

  it("discards a wrong version without corrupting drafts", () => {
    writeSettings({ ...sampleSettings(), version: 9 as never });
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "draft-still-here");
    const loaded = loadSettings();
    expect(loaded.invalidDiscarded).toBe(true);
    expect(loaded.settings.brand.markText).toBe("CP");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe("draft-still-here");
  });

  it("treats setItem failure as unavailable", () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } satisfies Storage;
    expect(saveSettings(sampleSettings(), store).status).toBe("unavailable");
  });

  it("treats getItem failure as unavailable defaults", () => {
    const store = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } satisfies Storage;
    const loaded = loadSettings(store);
    expect(loaded.storageAvailable).toBe(false);
    expect(loaded.settings.brand.productName).toBe("CreatorPreflight");
  });

  it("clears settings independently of drafts", () => {
    writeSettings();
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "draft");
    expect(clearSettings()).toBe("ok");
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe("draft");
  });

  it("does not throw when localStorage is missing", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadSettings().storageAvailable).toBe(false);
    expect(saveSettings(sampleSettings()).status).toBe("unavailable");
  });
});
