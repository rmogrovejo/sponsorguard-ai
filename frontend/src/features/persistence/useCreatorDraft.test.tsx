import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DEBOUNCE_MS } from "./draftKeys";
import { emptyDraft } from "./draftSchema";
import { useCreatorDraft } from "./useCreatorDraft";
import { sampleDraft, writeDraft } from "./draftTestFixtures";

describe("useCreatorDraft", () => {
  it("restores a valid draft without writing immediately", () => {
    writeDraft();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useCreatorDraft());
    expect(result.current.restored).toBe(true);
    expect(result.current.initialDraft.sponsoredContent.campaignName).toBe(
      "AcmeVPN September Campaign",
    );
    expect(result.current.status).toBe("saved");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("debounces autosave writes", () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useCreatorDraft());
    const base = emptyDraft().sponsoredContent;

    act(() => {
      result.current.updateSponsored({ ...base, campaignName: "One" });
      result.current.updateSponsored({ ...base, campaignName: "Two" });
      result.current.updateSponsored({ ...base, campaignName: "Three" });
    });
    expect(result.current.status).toBe("saving");
    expect(setItem).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(result.current.status).toBe("saved");
    const writes = setItem.mock.calls.filter(([key]) => key === "creatorpreflight:draft:v1");
    expect(writes).toHaveLength(1);
    expect(String(writes[0][1])).toContain("Three");
    expect(String(writes[0][1])).not.toContain("\"One\"");
  });

  it("surfaces a save-unavailable status when setItem fails", () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const { result } = renderHook(() => useCreatorDraft());
    act(() => {
      result.current.updateSponsored({
        ...emptyDraft().sponsoredContent,
        campaignName: "Keep working",
      });
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(result.current.status).toBe("unavailable");
    expect(result.current.statusText).toBe("Local save unavailable");
  });

  it("clears independently owned slices on start new draft", () => {
    writeDraft(sampleDraft());
    const { result } = renderHook(() => useCreatorDraft());
    act(() => {
      result.current.startNewDraft();
    });
    expect(result.current.initialDraft.sponsoredContent.campaignName).toBe("");
    expect(result.current.initialDraft.shortForm.platform).toBe("tiktok");
    expect(window.localStorage.getItem("creatorpreflight:draft:v1")).toBeNull();
  });
});
