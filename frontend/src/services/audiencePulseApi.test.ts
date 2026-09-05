import { describe, expect, it, vi } from "vitest";

import { jsonResponse } from "../test/testData";
import {
  analyzeAudiencePulse,
  AudiencePulseApiError,
} from "./audiencePulseApi";

const COMPLETE_REPORT = {
  source: "manual",
  analysis_status: "complete",
  analysis_error_code: null,
  comments_loaded: 3,
  comments_classified: 3,
  comments_actionable: 3,
  comments: [
    { id: "c1", text: "Does this work on Windows 11?", author: null },
    { id: "c2", text: "Make an AMD version", author: null },
    { id: "c3", text: "Great tip!", author: null },
  ],
  video: null,
  signals: [
    { category: "positive", count: 1, percentage: 34 },
    { category: "question", count: 1, percentage: 33 },
    { category: "content_request", count: 1, percentage: 33 },
    { category: "funny", count: 0, percentage: 0 },
    { category: "constructive_criticism", count: 0, percentage: 0 },
    { category: "negative", count: 0, percentage: 0 },
    { category: "confusion", count: 0, percentage: 0 },
    { category: "low_information", count: 0, percentage: null },
  ],
  themes: [
    {
      rank: 1,
      summary: "Viewers want an AMD version",
      comment_count: 1,
      evidence_comment_ids: ["c2"],
    },
  ],
  reply_worthy: [
    {
      kind: "question",
      text: "Does this work on Windows 11?",
      comment_id: "c1",
    },
  ],
  opportunities: [
    {
      rank: 1,
      title: "AMD optimization follow-up",
      grounded_in_count: 1,
      evidence_comment_ids: ["c2"],
    },
  ],
};

const PARTIAL_REPORT = {
  source: "youtube",
  analysis_status: "not_evaluated",
  analysis_error_code: "LLM_PROVIDER_RATE_LIMITED",
  comments_loaded: 2,
  comments_classified: 0,
  comments_actionable: 0,
  comments: [
    { id: "c1", text: "Does this work on Windows 11?", author: "Alex" },
    { id: "c2", text: "Make an AMD version", author: "Sam" },
  ],
  video: {
    id: "abcdefghijk",
    title: "PC Tips",
    channel_title: "Creator",
    comment_count_public: 3,
  },
  signals: [],
  themes: [],
  reply_worthy: [],
  opportunities: [],
};

describe("audiencePulseApi", () => {
  it("returns a validated complete report", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(COMPLETE_REPORT));
    const report = await analyzeAudiencePulse(
      { comments_text: "a\nb\nc" },
      { baseUrl: "http://example.test", fetchImpl },
    );
    expect(report.analysis_status).toBe("complete");
    expect(report.comments_loaded).toBe(3);
    expect(report.themes[0]?.summary).toContain("AMD");
  });

  it("accepts partial not_evaluated results without fake signals", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(PARTIAL_REPORT));
    const report = await analyzeAudiencePulse(
      { youtube_url: "https://youtube.com/shorts/abcdefghijk" },
      { fetchImpl },
    );
    expect(report.analysis_status).toBe("not_evaluated");
    expect(report.signals).toEqual([]);
    expect(report.comments).toHaveLength(2);
    expect(report.video?.title).toBe("PC Tips");
  });

  it("retries with loaded_comments without youtube_url", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(COMPLETE_REPORT));
    await analyzeAudiencePulse(
      {
        loaded_comments: PARTIAL_REPORT.comments,
        video: PARTIAL_REPORT.video,
      },
      { fetchImpl },
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.loaded_comments).toHaveLength(2);
    expect(body.youtube_url).toBeUndefined();
  });

  it("forwards analysis_language without altering comments", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(COMPLETE_REPORT));
    await analyzeAudiencePulse(
      { comments_text: "Does this work on Windows 11?", analysis_language: "es" },
      { fetchImpl },
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.analysis_language).toBe("es");
    expect(body.comments_text).toBe("Does this work on Windows 11?");
    expect(body.youtube_url).toBeUndefined();
  });

  it("maps YouTube not configured without leaking secrets", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "YOUTUBE_NOT_CONFIGURED",
            message: "secret key path /tmp/keys",
          },
        },
        503,
      ),
    );
    try {
      await analyzeAudiencePulse(
        { youtube_url: "https://youtube.com/shorts/abcdefghijk" },
        { fetchImpl },
      );
      throw new Error("expected failure");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AudiencePulseApiError);
      expect(String(error)).not.toContain("secret");
      expect((error as AudiencePulseApiError).code).toBe("YOUTUBE_NOT_CONFIGURED");
    }
  });
});
