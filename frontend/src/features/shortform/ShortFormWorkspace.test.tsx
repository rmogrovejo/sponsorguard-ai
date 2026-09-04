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
    total: 6,
    evaluated: 6,
    not_evaluated: 0,
    passed: 5,
    warnings: 1,
    failed: 0,
    readiness_score: 91.67,
    verification_coverage: 100,
  },
  findings: [
    {
      check_id: "orientation",
      category: "format",
      status: "pass",
      title: "Orientation",
      reason: "9:16 portrait frame detected (1080 × 1920).",
      recommendation: null,
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
      ranges: [],
      measurements: null,
    },
    {
      check_id: "dead_air",
      category: "pacing",
      status: "warning",
      title: "Pacing review",
      reason: "2.42 sec low-energy interval.",
      recommendation: "Review this pacing gap before publishing.",
      ranges: [{ start_seconds: 14.2, end_seconds: 16.62, duration_seconds: 2.42 }],
      measurements: { interval_count: 1 },
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
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(REPORT)),
    );
    render(<ShortFormWorkspace />);
    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    await user.click(screen.getByRole("button", { name: "Start preflight" }));

    expect(await screen.findByText("READINESS")).toBeInTheDocument();
    expect(screen.getByText("Vertical HD frame detected.")).toBeVisible();
    expect(screen.getByText(/18.40 sec/)).toBeVisible();
    expect(screen.getByText(/00:14.20 → 00:16.62/)).toBeVisible();
    expect(screen.getByLabelText("Pacing timeline")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "TikTok" })).toBeVisible();
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
