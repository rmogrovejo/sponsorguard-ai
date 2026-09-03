import { describe, expect, it, vi } from "vitest";

import { jsonResponse } from "../test/testData";
import {
  BriefExtractionApiError,
  extractBriefRequirements,
} from "./briefExtractionApi";


const RESPONSE = {
  requirements: [
    {
      id: "req_ai_brand",
      type: "required_mention_before",
      description: "Mention AcmeVPN in the first minute",
      value: "AcmeVPN",
      before_seconds: 60,
      source_text: "Mention AcmeVPN in the first 60 seconds.",
    },
  ],
  meta: {
    provider: "test-provider",
    model: "test-model",
    prompt_version: "1.0",
    requirement_count: 1,
  },
};

describe("brief extraction API client", () => {
  it("sends the exact brief payload and validates the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(RESPONSE));

    const result = await extractBriefRequirements(
      { brief: "Mention AcmeVPN in the first 60 seconds." },
      { baseUrl: "http://example.test/", fetchImpl },
    );

    expect(result.requirements[0].value).toBe("AcmeVPN");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "http://example.test/api/v1/briefs/extract",
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      brief: "Mention AcmeVPN in the first 60 seconds.",
    });
  });

  it("rejects malformed successful responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ...RESPONSE, meta: { requirement_count: 99 } }));

    await expect(
      extractBriefRequirements({ brief: "A brief" }, { fetchImpl }),
    ).rejects.toMatchObject({
      kind: "malformed_response",
      code: "MALFORMED_API_RESPONSE",
    });
  });

  it("translates provider configuration failures into manual-fallback language", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "LLM_PROVIDER_CONFIGURATION_ERROR",
            message: "internal details",
            details: null,
          },
        },
        503,
      ),
    );

    await expect(
      extractBriefRequirements({ brief: "A brief" }, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "LLM_PROVIDER_CONFIGURATION_ERROR",
      retryable: false,
      message:
        "Requirement extraction is not configured. You can keep adding rules manually.",
    });
  });

  it("reports a real abort timeout with a stable safe error", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("private timeout", "AbortError")),
        );
      }),
    );

    const assertion = expect(
      extractBriefRequirements(
        { brief: "A brief" },
        { fetchImpl, timeoutMs: 25 },
      ),
    ).rejects.toMatchObject({
      kind: "timeout",
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("does not expose raw network exceptions", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket C:\\private\\provider"));

    try {
      await extractBriefRequirements({ brief: "A brief" }, { fetchImpl });
      throw new Error("Expected extraction to fail");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BriefExtractionApiError);
      expect(error).toMatchObject({
        kind: "network",
        code: "NETWORK_ERROR",
      });
      expect(String(error)).not.toContain("private");
    }
  });
});
