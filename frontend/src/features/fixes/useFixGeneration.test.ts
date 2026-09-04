import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FixGenerationApiError,
  generateFix,
} from "../../services/fixGenerationApi";
import type {
  ComplianceResult,
  GeneratedFix,
  RequirementPayload,
} from "../../types/compliance";
import { VALID_SRT } from "../../test/testData";
import type { ReviewReportSnapshot } from "../review/useComplianceAnalysis";
import { useFixGeneration } from "./useFixGeneration";

vi.mock("../../services/fixGenerationApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/fixGenerationApi")>();
  return {
    ...actual,
    generateFix: vi.fn(),
  };
});

const requestFix = vi.mocked(generateFix);

const TOKEN_REQUIREMENT: RequirementPayload = {
  id: "req_coupon",
  type: "required_exact_token",
  description: "Use code",
  value: "CREATOR25",
};

const TALK_REQUIREMENT: RequirementPayload = {
  id: "req_talk",
  type: "required_talking_point",
  description: "Explain benefit",
  value: "Reduces editing time",
};

const TOKEN_FINDING: ComplianceResult = {
  requirement_id: "req_coupon",
  status: "fail",
  reason_code: "REQUIRED_TOKEN_MISSING",
  reason: 'Required token "CREATOR25" was not found.',
  source_segment_index: null,
  timestamp_seconds: null,
  evidence: null,
};

const TALK_FINDING: ComplianceResult = {
  requirement_id: "req_talk",
  status: "warning",
  reason_code: "SEMANTIC_REQUIREMENT_UNCERTAIN",
  reason: "The talking point could not be confirmed.",
  source_segment_index: 2,
  timestamp_seconds: 52,
  evidence: "You can save twenty-five percent using my link.",
};

const TOKEN_FIX: GeneratedFix = {
  requirement_id: "req_coupon",
  action: "insert",
  suggested_text: "Use code CREATOR25 at checkout.",
  placement: {
    strategy: "after_segment",
    source_segment_index: 2,
    timestamp_seconds: 52,
    before_seconds: null,
  },
  reason: "Insert the missing required promo code.",
};

const TALK_FIX: GeneratedFix = {
  requirement_id: "req_talk",
  action: "insert",
  suggested_text: "It helps reduce editing time.",
  placement: {
    strategy: "after_segment",
    source_segment_index: 2,
    timestamp_seconds: 52,
    before_seconds: null,
  },
  reason: "Clarify the required meaning.",
};

function snapshot(
  overrides: Partial<ReviewReportSnapshot> = {},
): ReviewReportSnapshot {
  return {
    campaignName: "AcmeVPN September Campaign",
    requirementDescriptions: {
      req_coupon: "Use code",
      req_talk: "Explain benefit",
    },
    requirementTypes: {
      req_coupon: "required_exact_token",
      req_talk: "required_talking_point",
    },
    requirementsById: {
      req_coupon: TOKEN_REQUIREMENT,
      req_talk: TALK_REQUIREMENT,
    },
    transcriptContent: VALID_SRT,
    response: {
      summary: {
        total: 2,
        evaluated: 2,
        not_evaluated: 0,
        passed: 0,
        warnings: 1,
        failed: 1,
        compliance_score: 25,
        verification_coverage: 100,
      },
      results: [TOKEN_FINDING, TALK_FINDING],
    },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useFixGeneration", () => {
  beforeEach(() => {
    requestFix.mockReset();
  });

  it("keeps each finding in an isolated state", async () => {
    const first = deferred<GeneratedFix>();
    requestFix.mockReturnValueOnce(first.promise);
    const report = snapshot();

    const { result } = renderHook(() => useFixGeneration(report));

    act(() => {
      void result.current.generate(TOKEN_FINDING);
    });

    expect(result.current.stateFor("req_coupon").phase).toBe("generating");
    expect(result.current.stateFor("req_talk").phase).toBe("idle");

    await act(async () => {
      first.resolve(TOKEN_FIX);
      await first.promise;
    });

    expect(result.current.stateFor("req_coupon")).toEqual({
      phase: "success",
      suggestion: TOKEN_FIX,
      error: null,
    });
    expect(result.current.stateFor("req_talk")).toEqual({
      phase: "idle",
      suggestion: null,
      error: null,
    });
  });

  it("does not start a duplicate request for the same finding", async () => {
    const pending = deferred<GeneratedFix>();
    requestFix.mockReturnValue(pending.promise);
    const report = snapshot();

    const { result } = renderHook(() => useFixGeneration(report));

    act(() => {
      void result.current.generate(TOKEN_FINDING);
      void result.current.generate(TOKEN_FINDING);
    });

    expect(requestFix).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(TOKEN_FIX);
      await pending.promise;
    });
  });

  it("allows unrelated findings to generate while another request is in flight", async () => {
    const first = deferred<GeneratedFix>();
    const second = deferred<GeneratedFix>();
    requestFix
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const report = snapshot();

    const { result } = renderHook(() => useFixGeneration(report));

    act(() => {
      void result.current.generate(TOKEN_FINDING);
      void result.current.generate(TALK_FINDING);
    });

    expect(requestFix).toHaveBeenCalledTimes(2);
    expect(result.current.stateFor("req_coupon").phase).toBe("generating");
    expect(result.current.stateFor("req_talk").phase).toBe("generating");

    await act(async () => {
      first.resolve(TOKEN_FIX);
      await first.promise;
    });

    expect(result.current.stateFor("req_coupon").phase).toBe("success");
    expect(result.current.stateFor("req_talk").phase).toBe("generating");

    await act(async () => {
      second.resolve(TALK_FIX);
      await second.promise;
    });

    expect(result.current.stateFor("req_talk").suggestion).toEqual(TALK_FIX);
  });

  it("records a retryable provider failure without changing other findings", async () => {
    requestFix
      .mockResolvedValueOnce(TOKEN_FIX)
      .mockRejectedValueOnce(
        new FixGenerationApiError(
          "LLM_PROVIDER_TIMEOUT",
          "Fix generation took too long. Try again.",
          true,
        ),
      );

    const report = snapshot();
    const { result } = renderHook(() => useFixGeneration(report));

    await act(async () => {
      await result.current.generate(TOKEN_FINDING);
    });
    await act(async () => {
      await result.current.generate(TALK_FINDING);
    });

    expect(result.current.stateFor("req_coupon").phase).toBe("success");
    expect(result.current.stateFor("req_talk")).toEqual({
      phase: "error",
      suggestion: null,
      error: {
        message: "Fix generation took too long. Try again.",
        retryable: true,
      },
    });
  });

  it("retries a failed finding and can regenerate a successful suggestion", async () => {
    const regenerated: GeneratedFix = {
      ...TOKEN_FIX,
      reason: "Insert the missing required promo code.",
    };
    requestFix
      .mockRejectedValueOnce(
        new FixGenerationApiError(
          "LLM_PROVIDER_UNAVAILABLE",
          "Fix generation is temporarily unavailable.",
          true,
        ),
      )
      .mockResolvedValueOnce(TOKEN_FIX)
      .mockResolvedValueOnce(regenerated);

    const report = snapshot();
    const { result } = renderHook(() => useFixGeneration(report));

    await act(async () => {
      await result.current.generate(TOKEN_FINDING);
    });
    expect(result.current.stateFor("req_coupon").phase).toBe("error");

    await act(async () => {
      await result.current.generate(TOKEN_FINDING);
    });
    expect(result.current.stateFor("req_coupon").suggestion).toEqual(TOKEN_FIX);

    await act(async () => {
      await result.current.generate(TOKEN_FINDING);
    });
    expect(result.current.stateFor("req_coupon").phase).toBe("success");
    expect(result.current.stateFor("req_coupon").suggestion).toEqual(regenerated);
    expect(requestFix).toHaveBeenCalledTimes(3);
  });

  it("dismisses one suggestion without clearing another finding", async () => {
    requestFix
      .mockResolvedValueOnce(TOKEN_FIX)
      .mockResolvedValueOnce(TALK_FIX);

    const report = snapshot();
    const { result } = renderHook(() => useFixGeneration(report));

    await act(async () => {
      await result.current.generate(TOKEN_FINDING);
      await result.current.generate(TALK_FINDING);
    });

    act(() => {
      result.current.dismiss("req_coupon");
    });

    expect(result.current.stateFor("req_coupon").phase).toBe("idle");
    expect(result.current.stateFor("req_talk").suggestion).toEqual(TALK_FIX);
  });

  it("discards an in-flight result after the report is replaced", async () => {
    const pending = deferred<GeneratedFix>();
    requestFix.mockReturnValueOnce(pending.promise);

    const firstReport = snapshot();
    const { result, rerender } = renderHook(
      ({ report }) => useFixGeneration(report),
      { initialProps: { report: firstReport } },
    );

    act(() => {
      void result.current.generate(TOKEN_FINDING);
    });

    const nextReport = snapshot({ campaignName: "Replacement review" });
    rerender({ report: nextReport });

    await act(async () => {
      pending.resolve(TOKEN_FIX);
      await pending.promise;
    });

    expect(result.current.stateFor("req_coupon").phase).toBe("idle");
    expect(result.current.stateFor("req_coupon").suggestion).toBeNull();
  });

  it("preserves a successful suggestion until the report changes", async () => {
    requestFix.mockResolvedValueOnce(TOKEN_FIX);
    const firstReport = snapshot();
    const { result, rerender } = renderHook(
      ({ report }) => useFixGeneration(report),
      { initialProps: { report: firstReport } },
    );

    await act(async () => {
      await result.current.generate(TOKEN_FINDING);
    });
    expect(result.current.stateFor("req_coupon").suggestion).toEqual(TOKEN_FIX);

    rerender({ report: firstReport });
    expect(result.current.stateFor("req_coupon").suggestion).toEqual(TOKEN_FIX);

    rerender({ report: snapshot({ campaignName: "Next analysis" }) });
    await waitFor(() => {
      expect(result.current.stateFor("req_coupon").phase).toBe("idle");
    });
  });
});
