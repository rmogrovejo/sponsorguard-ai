import { describe, expect, it, vi } from "vitest";

import { DRAFT_STORAGE_KEY, MAX_PERSISTED_BRIEF_CHARACTERS } from "./draftKeys";
import { canonicalDraftPayload } from "./draftSchema";
import { clearDraft, loadDraft, saveDraft } from "./draftStorage";
import { sampleDraft, writeDraft } from "./draftTestFixtures";

describe("draft storage", () => {
  it("saves and loads a valid draft", () => {
    const draft = sampleDraft();
    const saved = saveDraft(draft);
    expect(saved.status).toBe("ok");
    const loaded = loadDraft();
    expect(loaded.restored).toBe(true);
    expect(loaded.invalidDiscarded).toBe(false);
    expect(loaded.draft.sponsoredContent.campaignName).toBe(draft.sponsoredContent.campaignName);
    expect(loaded.draft.sponsoredContent.sponsorBrief).toBe(draft.sponsoredContent.sponsorBrief);
    expect(loaded.draft.sponsoredContent.requirements).toEqual(draft.sponsoredContent.requirements);
    expect(loaded.draft.sponsoredContent.transcriptContent).toBe(draft.sponsoredContent.transcriptContent);
    expect(loaded.draft.shortForm.platform).toBe("instagram_reels");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toMatch(/video\/mp4/);
    expect(canonicalDraftPayload(loaded.draft)).not.toContain("report");
  });

  it("does not persist a File object or analysis report fields", () => {
    saveDraft(sampleDraft());
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? "";
    expect(raw).not.toContain("clip.mp4");
    expect(JSON.parse(raw).shortForm.hadVideoSelected).toBe(true);
    expect(JSON.parse(raw)).not.toHaveProperty("report");
    expect(JSON.parse(raw).sponsoredContent).not.toHaveProperty("file");
  });

  it("discards invalid JSON and still returns an empty draft", () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{broken");
    const loaded = loadDraft();
    expect(loaded.invalidDiscarded).toBe(true);
    expect(loaded.restored).toBe(false);
    expect(loaded.draft.sponsoredContent.campaignName).toBe("");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("discards a wrong version", () => {
    writeDraft({ ...sampleDraft(), version: 9 as never });
    const loaded = loadDraft();
    expect(loaded.invalidDiscarded).toBe(true);
    expect(loaded.draft.activeModule).toBe("shortform");
  });

  it("treats setItem failure as unavailable without throwing", () => {
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
    const result = saveDraft(sampleDraft(), store);
    expect(result.status).toBe("unavailable");
  });

  it("treats getItem failure as unavailable and starts empty", () => {
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
    const loaded = loadDraft(store);
    expect(loaded.storageAvailable).toBe(false);
    expect(loaded.draft.sponsoredContent.campaignName).toBe("");
    expect(loaded.draft.shortForm.platform).toBe("tiktok");
  });

  it("clears a saved draft", () => {
    writeDraft();
    expect(clearDraft()).toBe("ok");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("keeps short-form data when only sponsored content is rewritten in a full document save", () => {
    const original = sampleDraft();
    saveDraft(original);
    const next = {
      ...original,
      sponsoredContent: {
        ...original.sponsoredContent,
        campaignName: "Updated campaign",
      },
    };
    saveDraft(next);
    const loaded = loadDraft();
    expect(loaded.draft.sponsoredContent.campaignName).toBe("Updated campaign");
    expect(loaded.draft.shortForm.platform).toBe("instagram_reels");
  });

  it("skips saving an oversized draft without truncating stored content", () => {
    const previous = sampleDraft();
    saveDraft(previous);
    const oversized = sampleDraft();
    oversized.sponsoredContent.sponsorBrief = "x".repeat(MAX_PERSISTED_BRIEF_CHARACTERS + 1);
    expect(saveDraft(oversized).status).toBe("too_large");
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? "";
    expect(raw).toContain("Mention AcmeVPN and the code SAVE20");
    expect(raw).not.toContain("x".repeat(100));
  });

  it("does not throw when localStorage is missing", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadDraft().storageAvailable).toBe(false);
    expect(saveDraft(sampleDraft()).status).toBe("unavailable");
  });
});
