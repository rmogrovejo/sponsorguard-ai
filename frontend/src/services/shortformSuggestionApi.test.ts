import { describe, expect, it, vi } from "vitest";

import { jsonResponse } from "../test/testData";
import type { PreflightFinding } from "../types/shortform";
import { generateShortFormSuggestion, ShortFormSuggestionApiError } from "./shortformSuggestionApi";

const finding: PreflightFinding = {
  check_id: "opening",
  category: "opening",
  status: "warning",
  title: "Opening",
  reason: "The viewer payoff arrives after a generic introduction.",
  recommendation: "Establish the viewer-facing subject earlier.",
  evidence_text: "Hey guys, welcome back.",
  ranges: [{ start_seconds: 0, end_seconds: 3.2, duration_seconds: 3.2 }],
  measurements: { hook_decision: "review" },
};

const suggestion = {
  finding_id: "opening",
  type: "opening",
  outcome: "suggested",
  suggested_text: "Three settings are slowing down your PC.",
  reason: "The opening is generic.",
  referenced_segment_indices: [1],
  placement: {
    strategy: "replace_opening",
    start_seconds: 0,
    end_seconds: 3.2,
    after_seconds: null,
  },
  display_label: "SUGGESTED OPENING",
};

describe("shortform suggestion API client", () => {
  it("posts a versioned suggestion request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(suggestion));
    const result = await generateShortFormSuggestion(
      {
        finding_id: "opening",
        platform: "tiktok",
        finding,
        speech_segments: [
          { index: 1, start_seconds: 0, end_seconds: 3.2, text: "Hey guys, welcome back." },
        ],
        video_duration_seconds: 30,
      },
      { baseUrl: "http://example.test", fetchImpl },
    );

    expect(result.suggested_text).toBe("Three settings are slowing down your PC.");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "http://example.test/api/v1/shortform/suggestions/generate",
    );
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("POST");
  });

  it("translates ineligible and provider errors without leaking internals", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: "SUGGESTION_NOT_ELIGIBLE", message: "Gemini secret" } }, 400),
    );

    await expect(
      generateShortFormSuggestion(
        {
          finding_id: "opening",
          platform: "tiktok",
          finding,
          speech_segments: [],
          video_duration_seconds: 30,
        },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: "ShortFormSuggestionApiError",
      code: "SUGGESTION_NOT_ELIGIBLE",
      message: "This finding is not eligible for a suggestion.",
    });
  });

  it("marks timeout and rate-limit failures as retryable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: "LLM_PROVIDER_RATE_LIMITED", message: "busy" } }, 429),
    );

    await expect(
      generateShortFormSuggestion(
        {
          finding_id: "cta",
          platform: "tiktok",
          finding: { ...finding, check_id: "cta", category: "cta" },
          speech_segments: [],
          video_duration_seconds: 30,
        },
        { fetchImpl },
      ),
    ).rejects.toBeInstanceOf(ShortFormSuggestionApiError);
    await expect(
      generateShortFormSuggestion(
        {
          finding_id: "cta",
          platform: "tiktok",
          finding: { ...finding, check_id: "cta", category: "cta" },
          speech_segments: [],
          video_duration_seconds: 30,
        },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ retryable: true });
  });
});
