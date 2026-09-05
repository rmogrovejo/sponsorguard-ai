import { DRAFT_STORAGE_KEY, DRAFT_VERSION } from "./draftKeys";
import type { CreatorDraft } from "./draftSchema";

export function sampleDraft(overrides: Partial<CreatorDraft> = {}): CreatorDraft {
  return {
    version: DRAFT_VERSION,
    savedAt: "2026-09-04T02:00:00.000Z",
    activeModule: "sponsored",
    sponsoredContent: {
      campaignName: "AcmeVPN September Campaign",
      sponsorBrief: "Mention AcmeVPN and the code SAVE20 before the first minute.",
      requirements: [
        {
          id: "req_restore_1",
          type: "required_mention",
          description: "Mention AcmeVPN",
          value: "AcmeVPN",
          beforeSeconds: "60",
        },
        {
          id: "req_restore_2",
          type: "required_exact_token",
          description: "Use the campaign code",
          value: "SAVE20",
          beforeSeconds: "",
          provenance: {
            kind: "sponsor_brief",
            sourceText: "Use code SAVE20",
          },
        },
      ],
      transcriptContent: "1\n00:00:00,000 --> 00:00:02,000\nHello from the restored SRT.",
      transcriptFileName: "campaign.srt",
    },
    shortForm: {
      platform: "instagram_reels",
      hadVideoSelected: true,
    },
    audiencePulse: {
      youtubeUrl: "",
      commentsText: "",
      inputMode: "youtube",
      manualSource: "other",
    },
    ...overrides,
  };
}

export function writeDraft(draft: CreatorDraft = sampleDraft()): void {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}
