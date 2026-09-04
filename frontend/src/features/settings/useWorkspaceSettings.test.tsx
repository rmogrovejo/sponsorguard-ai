import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SETTINGS_AUTOSAVE_DEBOUNCE_MS, SETTINGS_STORAGE_KEY } from "./settingsKeys";
import { defaultSettings } from "./settingsSchema";
import { useWorkspaceSettings } from "./useWorkspaceSettings";
import { sampleSettings, writeSettings } from "./settingsTestFixtures";

describe("useWorkspaceSettings", () => {
  it("restores valid settings and applies appearance tokens", () => {
    writeSettings();
    const { result } = renderHook(() => useWorkspaceSettings());
    expect(result.current.settings.brand.productName).toBe("StudioPreflight");
    expect(document.documentElement.dataset.accent).toBe("olive");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(document.title).toBe("StudioPreflight");
    expect(result.current.status).toBe("saved");
  });

  it("debounces settings writes", () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useWorkspaceSettings());
    act(() => {
      result.current.updateBrand({
        ...defaultSettings().brand,
        productName: "One",
      });
      result.current.updateBrand({
        ...defaultSettings().brand,
        productName: "Two",
      });
      result.current.updateBrand({
        ...defaultSettings().brand,
        productName: "Three",
      });
    });
    expect(result.current.status).toBe("saving");
    const before = setItem.mock.calls.filter(([key]) => key === SETTINGS_STORAGE_KEY);
    expect(before).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(SETTINGS_AUTOSAVE_DEBOUNCE_MS);
    });
    expect(result.current.status).toBe("saved");
    const writes = setItem.mock.calls.filter(([key]) => key === SETTINGS_STORAGE_KEY);
    expect(writes).toHaveLength(1);
    expect(String(writes[0][1])).toContain("Three");
  });

  it("keeps live settings in memory when setItem fails", () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const { result } = renderHook(() => useWorkspaceSettings());
    act(() => {
      result.current.updateAppearance({
        ...defaultSettings().appearance,
        accent: "olive",
      });
      vi.advanceTimersByTime(SETTINGS_AUTOSAVE_DEBOUNCE_MS);
    });
    expect(result.current.status).toBe("unavailable");
    expect(result.current.statusText).toBe("Settings save unavailable");
    expect(result.current.settings.appearance.accent).toBe("olive");
    expect(document.documentElement.dataset.accent).toBe("olive");
  });

  it("restores defaults without requiring a reload", () => {
    writeSettings(sampleSettings());
    const { result } = renderHook(() => useWorkspaceSettings());
    act(() => {
      result.current.restoreDefaults();
    });
    expect(result.current.settings.brand.productName).toBe("CreatorPreflight");
    expect(result.current.settings.appearance.accent).toBe("terracotta");
    expect(document.documentElement.dataset.accent).toBe("terracotta");
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
