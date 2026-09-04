import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShortFormReport } from "../../types/shortform";
import { useShortFormSuggestions } from "./useShortFormSuggestions";

const REPORT: ShortFormReport = {
  platform: "tiktok",
  media: {
    filename: "clip.mp4",
    size_bytes: 2048,
    duration_seconds: 30,
    width: 1080,
    height: 1920,
    aspect_ratio: 0.5625,
    orientation: "portrait",
    has_audio: true,
  },
  summary: {
    total: 9,
    evaluated: 9,
    not_evaluated: 0,
    passed: 7,
    warnings: 2,
    failed: 0,
    readiness_score: 88.89,
    verification_coverage: 100,
  },
  speech: null,
  speech_segments: [
    {
      index: 1,
      start_seconds: 0,
      end_seconds: 3.2,
      text: "Hey guys, welcome back to another video.",
    },
  ],
  priorities: [],
  findings: [
    {
      check_id: "opening",
      category: "opening",
      status: "warning",
      title: "Opening",
      reason: "The viewer payoff arrives after a generic introduction.",
      recommendation: "Establish the subject earlier.",
      evidence_text: "Hey guys, welcome back to another video.",
      ranges: [{ start_seconds: 0, end_seconds: 3.2, duration_seconds: 3.2 }],
      measurements: null,
    },
    {
      check_id: "cta",
      category: "cta",
      status: "warning",
      title: "Call to action",
      reason: "No clear call to action detected near the ending.",
      recommendation: "Consider a next step.",
      evidence_text: null,
      ranges: [],
      measurements: null,
    },
  ],
};

describe("useShortFormSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prevents duplicate in-flight requests for the same finding", async () => {
    let release!: (value: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useShortFormSuggestions(REPORT));

    await act(async () => {
      void result.current.generate("opening");
      void result.current.generate("opening");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.stateFor("cta").phase).toBe("idle");

    release(
      new Response(
        JSON.stringify({
          finding_id: "opening",
          type: "opening",
          outcome: "suggested",
          suggested_text: "Three settings are slowing down your PC.",
          reason: "Generic introduction.",
          referenced_segment_indices: [1],
          placement: {
            strategy: "replace_opening",
            start_seconds: 0,
            end_seconds: 3.2,
            after_seconds: null,
          },
          display_label: "SUGGESTED OPENING",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await waitFor(() => {
      expect(result.current.stateFor("opening").phase).toBe("success");
    });
  });
});
