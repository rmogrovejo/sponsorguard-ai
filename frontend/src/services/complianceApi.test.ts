import { describe, expect, it, vi } from "vitest";

import type { AnalyzeComplianceRequest } from "../types/compliance";
import { jsonResponse, responseForRequest, VALID_SRT } from "../test/testData";
import { analyzeCompliance, ComplianceApiError } from "./complianceApi";

const REQUEST: AnalyzeComplianceRequest = {
  requirements: [
    {
      id: "req_brand",
      type: "required_mention",
      description: "Mention AcmeVPN",
      value: "AcmeVPN",
    },
  ],
  transcript: { format: "srt", content: VALID_SRT },
};

describe("compliance API client", () => {
  it("returns a validated successful response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(responseForRequest(REQUEST)));

    const response = await analyzeCompliance(REQUEST, {
      baseUrl: "http://example.test/",
      fetchImpl,
    });

    expect(response.summary.compliance_score).toBe(100);
    expect(response.results[0].evidence).toBe(
      "Today's video is sponsored by AcmeVPN.",
    );
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "http://example.test/api/v1/compliance/analyze",
    );
  });

  it("accepts an all-not-evaluated report with a null score", async () => {
    const responseBody = responseForRequest(REQUEST, "not_evaluated");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(responseBody));

    const response = await analyzeCompliance(REQUEST, { fetchImpl });

    expect(response.summary).toEqual({
      total: 1,
      evaluated: 0,
      not_evaluated: 1,
      passed: 0,
      warnings: 0,
      failed: 0,
      compliance_score: null,
      verification_coverage: 0,
    });
    expect(response.results[0].status).toBe("not_evaluated");
  });

  it("translates structured transcript failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "INVALID_TRANSCRIPT",
            message: "Internal parser message",
            details: {},
          },
        },
        400,
      ),
    );

    await expect(
      analyzeCompliance(REQUEST, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "INVALID_TRANSCRIPT",
      message:
        "The transcript could not be parsed. Check the SRT format and try again.",
    });
  });

  it("reports a timeout through a stable safe error", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    );

    const request = expect(
      analyzeCompliance(REQUEST, { fetchImpl, timeoutMs: 25 }),
    ).rejects.toMatchObject({
      kind: "timeout",
      code: "REQUEST_TIMEOUT",
      message: "SponsorGuard took too long to respond. Try the review again.",
    });
    await vi.advanceTimersByTimeAsync(25);
    await request;
  });

  it("rejects malformed success responses instead of trusting them", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ summary: {}, results: "invalid" }));

    await expect(
      analyzeCompliance(REQUEST, { fetchImpl }),
    ).rejects.toMatchObject({
      kind: "malformed_response",
      code: "MALFORMED_API_RESPONSE",
    });
  });

  it("does not expose raw network exception messages", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket C:\\secret\\internal"));

    try {
      await analyzeCompliance(REQUEST, { fetchImpl });
      throw new Error("Expected the API request to fail");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ComplianceApiError);
      expect(error).toMatchObject({
        kind: "network",
        message: "Could not connect to SponsorGuard API.",
      });
      expect(String(error)).not.toContain("secret");
    }
  });
});
