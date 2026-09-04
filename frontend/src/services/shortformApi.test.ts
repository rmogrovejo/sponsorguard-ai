import { describe, expect, it, vi } from "vitest";

import { jsonResponse } from "../test/testData";
import { analyzeShortForm, ShortFormApiError } from "./shortformApi";

const FILE = new File([new Uint8Array(8)], "clip.mp4", { type: "video/mp4" });

describe("shortform API client", () => {
  it("posts multipart data to the versioned endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        platform: "tiktok",
        media: {
          filename: "clip.mp4",
          size_bytes: 8,
          duration_seconds: 3,
          width: 1080,
          height: 1920,
          aspect_ratio: 0.5625,
          orientation: "portrait",
          has_audio: true,
        },
        summary: {
          total: 6,
          evaluated: 6,
          not_evaluated: 0,
          passed: 6,
          warnings: 0,
          failed: 0,
          readiness_score: 100,
          verification_coverage: 100,
        },
        findings: [],
      }),
    );

    const report = await analyzeShortForm("tiktok", FILE, {
      baseUrl: "http://example.test",
      fetchImpl,
    });

    expect(report.platform).toBe("tiktok");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "http://example.test/api/v1/shortform/analyze",
    );
    expect(fetchImpl.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
  });

  it("translates a media-too-large error without leaking internals", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        { error: { code: "MEDIA_TOO_LARGE", message: "secret path C:\\tmp" } },
        413,
      ),
    );

    await expect(analyzeShortForm("tiktok", FILE, { fetchImpl })).rejects.toMatchObject({
      code: "MEDIA_TOO_LARGE",
      message: "This video is too large for a single preflight.",
    });
    try {
      await analyzeShortForm("tiktok", FILE, { fetchImpl });
    } catch (error: unknown) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("rejects a malformed success payload", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    await expect(analyzeShortForm("tiktok", FILE, { fetchImpl })).rejects.toBeInstanceOf(
      ShortFormApiError,
    );
  });
});
