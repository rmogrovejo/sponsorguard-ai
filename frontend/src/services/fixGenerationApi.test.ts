import { describe, expect, it, vi } from "vitest";

import type { GenerateFixRequest } from "../types/compliance";
import { jsonResponse, VALID_SRT } from "../test/testData";
import { FixGenerationApiError, generateFix } from "./fixGenerationApi";

const DETERMINISTIC_REQUEST: GenerateFixRequest = {
  requirement: {
    id: "req_coupon",
    type: "required_exact_token",
    description: "Use code",
    value: "CREATOR25",
  },
  finding: {
    requirement_id: "req_coupon",
    status: "fail",
    reason_code: "REQUIRED_TOKEN_MISSING",
    reason: 'Required token "CREATOR25" was not found.',
    source_segment_index: null,
    timestamp_seconds: null,
    evidence: null,
  },
  transcript: { format: "srt", content: VALID_SRT },
};

const DETERMINISTIC_RESPONSE = {
  requirement_id: "req_coupon",
  action: "insert",
  suggested_text: "Use code CREATOR25 at checkout.",
  placement: {
    strategy: "after_segment",
    source_segment_index: 2,
    timestamp_seconds: 52.0,
    before_seconds: null,
  },
  reason: "Insert the missing required promo code.",
};

const SEMANTIC_RESPONSE = {
  requirement_id: "req_claim",
  action: "replace",
  suggested_text: "This VPN helps protect your online privacy.",
  placement: {
    strategy: "replace_segment",
    source_segment_index: 3,
    timestamp_seconds: 65.0,
    before_seconds: null,
  },
  reason: "Use measured privacy language.",
};

describe("fix generation API client", () => {
  it("returns a validated deterministic fix response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(DETERMINISTIC_RESPONSE));

    const fix = await generateFix(DETERMINISTIC_REQUEST, {
      baseUrl: "http://example.test",
      fetchImpl,
    });

    expect(fix.requirement_id).toBe("req_coupon");
    expect(fix.action).toBe("insert");
    expect(fix.suggested_text).toBe("Use code CREATOR25 at checkout.");
    expect(fix.placement?.strategy).toBe("after_segment");
    expect(fix.placement?.source_segment_index).toBe(2);
    expect(fix.placement?.timestamp_seconds).toBe(52.0);
    expect(fix.reason).toBe("Insert the missing required promo code.");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "http://example.test/api/v1/fixes/generate",
    );
  });

  it("returns a validated semantic fix response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(SEMANTIC_RESPONSE));

    const fix = await generateFix(DETERMINISTIC_REQUEST, {
      baseUrl: "http://example.test",
      fetchImpl,
    });

    expect(fix.action).toBe("replace");
    expect(fix.suggested_text).toBe(
      "This VPN helps protect your online privacy.",
    );
    expect(fix.placement?.strategy).toBe("replace_segment");
  });

  it("accepts a review_manually action with null suggested_text", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        requirement_id: "req_talk",
        action: "review_manually",
        suggested_text: null,
        placement: null,
        reason: "Manual review recommended.",
      }),
    );

    const fix = await generateFix(DETERMINISTIC_REQUEST, { fetchImpl });

    expect(fix.action).toBe("review_manually");
    expect(fix.suggested_text).toBeNull();
    expect(fix.placement).toBeNull();
  });

  it("translates an ineligible finding into a non-retryable error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "FIX_NOT_ELIGIBLE",
            message: "Internal message.",
          },
        },
        400,
      ),
    );

    await expect(
      generateFix(DETERMINISTIC_REQUEST, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "FIX_NOT_ELIGIBLE",
      message: "This finding is not eligible for a generated fix.",
      retryable: false,
    });
  });

  it("translates a provider timeout into a retryable error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "LLM_PROVIDER_TIMEOUT",
            message: "Internal timeout detail.",
          },
        },
        504,
      ),
    );

    await expect(
      generateFix(DETERMINISTIC_REQUEST, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "LLM_PROVIDER_TIMEOUT",
      message: "Fix generation took too long. Try again.",
      retryable: true,
    });
  });

  it("translates a rate limit into a retryable error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        { error: { code: "LLM_PROVIDER_RATE_LIMITED", message: "quota" } },
        429,
      ),
    );

    await expect(
      generateFix(DETERMINISTIC_REQUEST, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "LLM_PROVIDER_RATE_LIMITED",
      retryable: true,
    });
  });

  it("translates an invalid provider output into a retryable error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        { error: { code: "LLM_PROVIDER_OUTPUT_INVALID", message: "schema" } },
        502,
      ),
    );

    await expect(
      generateFix(DETERMINISTIC_REQUEST, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "LLM_PROVIDER_OUTPUT_INVALID",
      retryable: true,
    });
  });

  it("reports a client-side timeout through a stable safe error", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    );

    const request = expect(
      generateFix(DETERMINISTIC_REQUEST, { fetchImpl, timeoutMs: 25 }),
    ).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(25);
    await request;
  });

  it("rejects a malformed success response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ action: 999, reason: null }));

    await expect(
      generateFix(DETERMINISTIC_REQUEST, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "MALFORMED_API_RESPONSE",
      retryable: true,
    });
  });

  it("does not expose raw network exception messages", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket C:\\secret\\internal"));

    try {
      await generateFix(DETERMINISTIC_REQUEST, { fetchImpl });
      throw new Error("Expected the API request to fail");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(FixGenerationApiError);
      expect(String(error)).not.toContain("secret");
    }
  });

  it("does not expose internal error details from backend", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "LLM_PROVIDER_UNAVAILABLE",
            message: "secret internal detail",
          },
        },
        503,
      ),
    );

    try {
      await generateFix(DETERMINISTIC_REQUEST, { fetchImpl });
      throw new Error("Expected the API request to fail");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(FixGenerationApiError);
      expect(String(error)).not.toContain("secret");
    }
  });
});
