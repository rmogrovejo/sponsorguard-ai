import { describe, expect, it } from "vitest";

import {
  MAX_PERSISTED_BRIEF_CHARACTERS,
  MAX_PERSISTED_CAMPAIGN_NAME,
} from "./draftKeys";
import { parseCreatorDraft, validateCreatorDraft, isMeaningfulDraft } from "./draftSchema";
import { sampleDraft } from "./draftTestFixtures";

describe("draft schema validation", () => {
  it("accepts a valid versioned draft", () => {
    const parsed = parseCreatorDraft(JSON.stringify(sampleDraft()));
    expect(parsed).toMatchObject({
      version: 1,
      sponsoredContent: { campaignName: "AcmeVPN September Campaign" },
      shortForm: { platform: "instagram_reels" },
    });
    expect(typeof parsed === "string").toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(parseCreatorDraft("{not-json")).toBe("invalid_json");
  });

  it("rejects the wrong version", () => {
    expect(parseCreatorDraft(JSON.stringify({ ...sampleDraft(), version: 2 }))).toBe("wrong_version");
  });

  it("rejects an invalid requirement type", () => {
    const draft = sampleDraft();
    draft.sponsoredContent.requirements[0] = {
      ...draft.sponsoredContent.requirements[0],
      type: "not_a_real_type" as never,
    };
    expect(validateCreatorDraft(draft)).toBe("invalid_schema");
  });

  it("rejects malformed nested data and unexpected fields", () => {
    expect(validateCreatorDraft({ ...sampleDraft(), extra: true })).toBe("invalid_schema");
    expect(
      validateCreatorDraft({
        ...sampleDraft(),
        sponsoredContent: {
          ...sampleDraft().sponsoredContent,
          requirements: [{ id: 1, type: "required_mention" }],
        },
      }),
    ).toBe("invalid_schema");
  });

  it("rejects unexpected primitive types", () => {
    expect(validateCreatorDraft("draft")).toBe("invalid_schema");
    expect(validateCreatorDraft(1)).toBe("invalid_schema");
    expect(validateCreatorDraft(["draft"])).toBe("invalid_schema");
    expect(
      validateCreatorDraft({
        ...sampleDraft(),
        shortForm: { platform: "instagram_reels", hadVideoSelected: "yes" },
      }),
    ).toBe("invalid_schema");
  });

  it("rejects oversized strings instead of truncating them", () => {
    const oversizedBrief = sampleDraft();
    oversizedBrief.sponsoredContent.sponsorBrief = "x".repeat(MAX_PERSISTED_BRIEF_CHARACTERS + 1);
    expect(validateCreatorDraft(oversizedBrief)).toBe("oversized");

    const oversizedName = sampleDraft();
    oversizedName.sponsoredContent.campaignName = "n".repeat(MAX_PERSISTED_CAMPAIGN_NAME + 1);
    expect(validateCreatorDraft(oversizedName)).toBe("oversized");
  });

  it("does not treat an empty workspace as meaningful", () => {
    expect(isMeaningfulDraft(sampleDraft({
      activeModule: "shortform",
      sponsoredContent: {
        campaignName: "",
        sponsorBrief: "",
        requirements: [],
        transcriptContent: "",
        transcriptFileName: null,
      },
      shortForm: { platform: "tiktok", hadVideoSelected: false },
    }))).toBe(false);
  });

  it("treats a non-default Short-Form platform as meaningful", () => {
    expect(
      isMeaningfulDraft(
        sampleDraft({
          sponsoredContent: {
            campaignName: "",
            sponsorBrief: "",
            requirements: [],
            transcriptContent: "",
            transcriptFileName: null,
          },
          shortForm: { platform: "instagram_reels", hadVideoSelected: false },
        }),
        "tiktok",
      ),
    ).toBe(true);
  });

  it("accepts an old Audience Pulse draft without source metadata", () => {
    const parsed = validateCreatorDraft({
      ...sampleDraft(),
      audiencePulse: {
        youtubeUrl: "",
        commentsText: "Does this work on Windows 11?",
      },
    });
    expect(parsed).not.toEqual(expect.any(String));
    if (typeof parsed !== "string") {
      expect(parsed.audiencePulse.inputMode).toBe("manual");
      expect(parsed.audiencePulse.manualSource).toBe("other");
      expect(parsed.audiencePulse.commentsText).toBe("Does this work on Windows 11?");
    }
  });

  it("rejects an unknown Audience Pulse manual source", () => {
    expect(
      validateCreatorDraft({
        ...sampleDraft(),
        audiencePulse: {
          youtubeUrl: "",
          commentsText: "hello",
          inputMode: "manual",
          manualSource: "facebook",
        },
      }),
    ).toBe("invalid_schema");
  });

  it("does not treat the configured default platform as meaningful by itself", () => {
    expect(
      isMeaningfulDraft(
        sampleDraft({
          sponsoredContent: {
            campaignName: "",
            sponsorBrief: "",
            requirements: [],
            transcriptContent: "",
            transcriptFileName: null,
          },
          shortForm: { platform: "instagram_reels", hadVideoSelected: false },
        }),
        "instagram_reels",
      ),
    ).toBe(false);
  });
});
