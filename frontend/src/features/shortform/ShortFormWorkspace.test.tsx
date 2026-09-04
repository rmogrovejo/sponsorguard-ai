import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse } from "../../test/testData";
import { SHORTFORM_MAX_UPLOAD_BYTES, type ShortFormReport } from "../../types/shortform";
import { ShortFormWorkspace } from "./ShortFormWorkspace";

const REPORT: ShortFormReport = {
  platform: "tiktok",
  media: {
    filename: "clip.mp4",
    size_bytes: 2048,
    duration_seconds: 18.4,
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
    passed: 6,
    warnings: 3,
    failed: 0,
    readiness_score: 83.33,
    verification_coverage: 100,
  },
  speech: {
    audio_start_seconds: 0.6,
    activity_start_seconds: 0.6,
    has_usable_signal: true,
    method: "rms_energy_estimate",
    label: "VOICE / SPEECH ACTIVITY ESTIMATE",
  },
  speech_segments: [
    {
      index: 1,
      start_seconds: 3.8,
      end_seconds: 6.2,
      text: "Three settings are killing your FPS.",
    },
  ],
  priorities: [
    { rank: 1, title: "Strengthen opening", check_id: "opening", timestamp_seconds: 3.8 },
    { rank: 2, title: "Review pacing gap at 00:14.20", check_id: "dead_air", timestamp_seconds: 14.2 },
    { rank: 3, title: "Consider a closing CTA", check_id: "cta", timestamp_seconds: null },
  ],
  findings: [
    {
      check_id: "orientation",
      category: "format",
      status: "pass",
      title: "Orientation",
      reason: "9:16 portrait frame detected (1080 × 1920).",
      recommendation: null,
      evidence_text: null,
      ranges: [],
      measurements: { width: 1080, height: 1920 },
    },
    {
      check_id: "resolution",
      category: "format",
      status: "pass",
      title: "Resolution",
      reason: "Vertical HD frame detected.",
      recommendation: null,
      evidence_text: null,
      ranges: [],
      measurements: null,
    },
    {
      check_id: "duration",
      category: "format",
      status: "pass",
      title: "Duration",
      reason: "Duration 18.40s is within the preferred TikTok window.",
      recommendation: null,
      evidence_text: null,
      ranges: [],
      measurements: { duration_seconds: 18.4 },
    },
    {
      check_id: "audio_track",
      category: "audio",
      status: "pass",
      title: "Audio",
      reason: "Audio track detected.",
      recommendation: null,
      evidence_text: null,
      ranges: [],
      measurements: null,
    },
    {
      check_id: "speech_activity",
      category: "speech",
      status: "pass",
      title: "Speech",
      reason: "VOICE / SPEECH ACTIVITY ESTIMATE 00:00.60.",
      recommendation: null,
      evidence_text: null,
      ranges: [],
      measurements: { activity_start_seconds: 0.6 },
    },
    {
      check_id: "opening",
      category: "opening",
      status: "warning",
      title: "Opening",
      reason: "Main hook detected at 00:03.80. The video begins with a generic introduction before establishing the viewer payoff.",
      recommendation: "Establish the viewer-facing subject or payoff earlier in the opening.",
      evidence_text: "Three settings are killing your FPS.",
      ranges: [{ start_seconds: 3.8, end_seconds: 6.2, duration_seconds: 2.4 }],
      measurements: { hook_start_seconds: 3.8, hook_delay_seconds: 3.2 },
    },
    {
      check_id: "dead_air",
      category: "pacing",
      status: "warning",
      title: "Pacing review",
      reason: "2.42 sec low-energy interval.",
      recommendation: "Review this pacing gap before publishing.",
      evidence_text: null,
      ranges: [{ start_seconds: 14.2, end_seconds: 16.62, duration_seconds: 2.42 }],
      measurements: { interval_count: 1 },
    },
    {
      check_id: "cta",
      category: "cta",
      status: "warning",
      title: "Call to action",
      reason: "No clear call to action detected near the ending.",
      recommendation: "Consider giving the viewer an explicit next step.",
      evidence_text: null,
      ranges: [],
      measurements: { cta_decision: "not_found" },
    },
  ],
};

function mp4File(name = "clip.mp4", size = 2048): File {
  return new File([new Uint8Array(size)], name, { type: "video/mp4" });
}

describe("ShortFormWorkspace", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects, replaces, and removes a video without analyzing automatically", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<ShortFormWorkspace />);

    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    expect(await screen.findByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /TikTok/i })).toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.upload(screen.getByLabelText("Replace video"), mp4File("take-two.mp4"));
    expect(await screen.findByText("take-two.mp4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove file" }));
    expect(screen.queryByText("take-two.mp4")).not.toBeInTheDocument();
  });

  it("rejects a non-mp4 file locally", async () => {
    render(<ShortFormWorkspace />);
    fireEvent.change(screen.getByLabelText("Choose MP4"), {
      target: { files: [new File(["nope"], "notes.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(".mp4");
  });

  it("rejects an oversized local file", async () => {
    const user = userEvent.setup();
    const huge = mp4File();
    Object.defineProperty(huge, "size", { value: SHORTFORM_MAX_UPLOAD_BYTES + 1 });
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), huge);
    expect(await screen.findByRole("alert")).toHaveTextContent("too large");
  });

  it("keeps all three platform names readable in the selector", () => {
    render(<ShortFormWorkspace />);
    expect(screen.getByRole("radio", { name: /TikTok/i })).toBeVisible();
    expect(screen.getByRole("radio", { name: /YouTube Shorts/i })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Instagram Reels/i })).toBeVisible();
    expect(screen.getByRole("group", { name: "Short-form platform" })).toBeInTheDocument();
  });

  it("changes platform presets", async () => {
    const user = userEvent.setup();
    render(<ShortFormWorkspace />);
    await user.click(screen.getByRole("radio", { name: /YouTube Shorts/i }));
    expect(screen.getByRole("radio", { name: /YouTube Shorts/i })).toBeChecked();
  });

  it("renders a successful report with format, duration, and pacing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(REPORT));
    vi.stubGlobal("fetch", fetchMock);
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    await user.click(screen.getByRole("button", { name: "Start preflight" }));

    expect(await screen.findByText("READINESS")).toBeInTheDocument();
    expect(screen.getByText("Vertical HD frame detected.")).toBeVisible();
    expect(screen.getByText(/18.40 sec/)).toBeVisible();
    expect(screen.getByText(/00:14.20–00:16.62/)).toBeVisible();
    expect(screen.getByLabelText("Short-form timeline")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "TikTok" })).toBeVisible();
    expect(screen.getByText("Three settings are killing your FPS.")).toBeVisible();
    expect(screen.getByText("Strengthen opening")).toBeVisible();
    expect(screen.getByRole("button", { name: "Suggest stronger opening" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Suggest CTA" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/shortform/analyze");
  });

  it("generates opening and CTA suggestions independently and can dismiss them", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/shortform/analyze")) return jsonResponse(REPORT);
      if (url.includes("/shortform/suggestions/generate")) {
        const body = JSON.parse(String(init?.body)) as {
          finding_id: string;
        };
        if (body.finding_id === "opening") {
          return jsonResponse({
            finding_id: "opening",
            type: "opening",
            outcome: "suggested",
            suggested_text: "Three settings are slowing down your PC.",
            reason: "The opening is generic.",
            referenced_segment_indices: [1],
            placement: {
              strategy: "replace_opening",
              start_seconds: 3.8,
              end_seconds: 6.2,
              after_seconds: null,
            },
            display_label: "SUGGESTED OPENING",
          });
        }
        return jsonResponse({
          finding_id: "cta",
          type: "cta",
          outcome: "suggested",
          suggested_text: "Follow for part two.",
          reason: "The ending has no next action.",
          referenced_segment_indices: [2],
          placement: {
            strategy: "append_near_end",
            start_seconds: null,
            end_seconds: null,
            after_seconds: 18.4,
          },
          display_label: "SUGGESTED CTA",
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    await user.click(screen.getByRole("button", { name: "Start preflight" }));
    expect(await screen.findByRole("button", { name: "Suggest stronger opening" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Suggest stronger opening" }));
    expect(await screen.findByText("Three settings are slowing down your PC.")).toBeVisible();
    expect(screen.getByText("Replace opening / 00:03.80–00:06.20")).toBeVisible();
    expect(screen.getByRole("button", { name: "Suggest CTA" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Suggest CTA" }));
    expect(await screen.findByText("Follow for part two.")).toBeVisible();
    expect(screen.getByText("Three settings are slowing down your PC.")).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Dismiss suggestion" })[0]);
    expect(screen.queryByText("Three settings are slowing down your PC.")).not.toBeInTheDocument();
    expect(screen.getByText("Follow for part two.")).toBeVisible();
    expect(screen.getByLabelText("Readiness score 83.33 out of 100")).toBeInTheDocument();
  });

  it("keeps the existing report when suggestion generation fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/shortform/analyze")) return jsonResponse(REPORT);
      return jsonResponse({ error: { code: "LLM_PROVIDER_UNAVAILABLE", message: "down" } }, 503);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    await user.click(screen.getByRole("button", { name: "Start preflight" }));
    await user.click(await screen.findByRole("button", { name: "Suggest CTA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByLabelText("Readiness score 83.33 out of 100")).toBeInTheDocument();
    expect(screen.getByText("No clear call to action detected near the ending.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("shows a controlled backend failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ error: { code: "UNSUPPORTED_MEDIA", message: "bad" } }, 400),
      ),
    );
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    await user.click(screen.getByRole("button", { name: "Start preflight" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The uploaded file is not a readable MP4 video.",
    );
  });

  it("renders a partial not-evaluated pacing result", async () => {
    const user = userEvent.setup();
    const partial: ShortFormReport = {
      ...REPORT,
      summary: { ...REPORT.summary, evaluated: 5, not_evaluated: 1, warnings: 0, readiness_score: 80 },
      findings: REPORT.findings.map((item) =>
        item.check_id === "dead_air"
          ? {
              ...item,
              status: "not_evaluated",
              ranges: [],
              reason: "Pacing could not be evaluated because no audio track is present.",
              recommendation: null,
            }
          : item,
      ),
    };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(partial)));
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    await user.click(screen.getByRole("button", { name: "Start preflight" }));
    expect(await screen.findByText(/no audio track is present/i)).toBeVisible();
    expect(screen.getByText("Not evaluated")).toBeVisible();
  });

  it("does not persist a selected video file and asks the user to reselect after restore", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: undefined,
    });
    render(
      <ShortFormWorkspace
        initialPlatform="instagram_reels"
        restoredVideoSelected
      />,
    );
    expect(screen.getByRole("radio", { name: /Instagram Reels/i })).toBeChecked();
    expect(screen.getByText("Local video must be selected again after refresh.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start preflight" })).toBeDisabled();

    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    expect(await screen.findByText("clip.mp4")).toBeVisible();
    expect(
      screen.queryByText("Local video must be selected again after refresh."),
    ).not.toBeInTheDocument();
  });

  it("shows analyzing state while the request is in flight", async () => {
    const user = userEvent.setup();
    let release!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    await user.click(screen.getByRole("button", { name: "Start preflight" }));
    expect(await screen.findByRole("button", { name: "Running preflight…" })).toBeDisabled();
    release(jsonResponse(REPORT));
    await waitFor(() => expect(screen.getByText("READINESS")).toBeInTheDocument());
  });
});
