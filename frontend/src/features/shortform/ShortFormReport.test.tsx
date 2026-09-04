import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PreflightFinding, ShortFormReport } from "../../types/shortform";
import { ShortFormReportView } from "./ShortFormReport";

function finding(
  overrides: Partial<PreflightFinding> & Pick<PreflightFinding, "check_id" | "category" | "status" | "title" | "reason">,
): PreflightFinding {
  return {
    recommendation: null,
    evidence_text: null,
    ranges: [],
    measurements: null,
    ...overrides,
  };
}

function report(overrides: Partial<ShortFormReport> = {}): ShortFormReport {
  return {
    platform: "tiktok",
    media: {
      filename: "clip.mp4",
      size_bytes: 2048,
      duration_seconds: 30,
      width: 576,
      height: 1024,
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
    speech: {
      audio_start_seconds: 0.72,
      activity_start_seconds: 0.72,
      has_usable_signal: true,
      method: "rms_energy_estimate",
      label: "VOICE / SPEECH ACTIVITY ESTIMATE",
    },
    speech_segments: [],
    priorities: [],
    findings: [
      finding({
        check_id: "orientation",
        category: "format",
        status: "pass",
        title: "Orientation",
        reason: "9:16 portrait frame detected (576 × 1024).",
        measurements: { width: 576, height: 1024 },
      }),
      finding({
        check_id: "resolution",
        category: "format",
        status: "warning",
        title: "Resolution",
        reason: "Resolution is below the preferred vertical HD target.",
        recommendation: "Prefer at least 1080 × 1920 for TikTok.",
        measurements: { width: 576, height: 1024 },
      }),
      finding({
        check_id: "speech_activity",
        category: "speech",
        status: "pass",
        title: "Speech",
        reason: "VOICE / SPEECH ACTIVITY ESTIMATE 00:00.72.",
        measurements: { activity_start_seconds: 0.72 },
      }),
      finding({
        check_id: "opening",
        category: "opening",
        status: "pass",
        title: "Opening",
        reason: "Clear opening subject at 00:00.80.",
        evidence_text: "Three settings are destroying your FPS.",
        ranges: [{ start_seconds: 0.8, end_seconds: 3.2, duration_seconds: 2.4 }],
      }),
      finding({
        check_id: "dead_air",
        category: "pacing",
        status: "warning",
        title: "Pacing review",
        reason: "2.00 sec low-energy interval.",
        ranges: [{ start_seconds: 14, end_seconds: 16, duration_seconds: 2 }],
      }),
      finding({
        check_id: "cta",
        category: "cta",
        status: "pass",
        title: "Call to action",
        reason: "Detected at 00:27.40.",
        evidence_text: "Follow for the next part.",
        ranges: [{ start_seconds: 27.4, end_seconds: 29.1, duration_seconds: 1.7 }],
      }),
    ],
    ...overrides,
  };
}

describe("ShortFormReportView", () => {
  it("renders orientation and resolution as separate status rows", () => {
    render(<ShortFormReportView report={report()} />);
    expect(screen.getByText("FORMAT")).toBeVisible();
    expect(screen.getByText("ORIENTATION")).toBeVisible();
    expect(screen.getByText("RESOLUTION")).toBeVisible();
    expect(screen.getByText("9:16 portrait")).toBeVisible();
    expect(screen.getAllByText("576 × 1024")).toHaveLength(2);
    expect(screen.getByText("Resolution is below the preferred vertical HD target.")).toBeVisible();
    expect(screen.getByText("Prefer at least 1080 × 1920 for TikTok.")).toBeVisible();
    expect(screen.getAllByText("Pass").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0);
  });

  it("renders hook pass and grounded evidence", () => {
    render(<ShortFormReportView report={report()} />);
    expect(screen.getByText("OPENING")).toBeVisible();
    expect(screen.getByText("Clear opening subject at 00:00.80.")).toBeVisible();
    expect(screen.getByText("Three settings are destroying your FPS.")).toBeVisible();
    expect(screen.getAllByText("EVIDENCE").length).toBeGreaterThan(0);
  });

  it("renders hook warning copy", () => {
    render(
      <ShortFormReportView
        report={report({
          findings: [
            finding({
              check_id: "opening",
              category: "opening",
              status: "warning",
              title: "Opening",
              reason: "Main hook detected at 00:03.80.",
              evidence_text: "Three settings are killing your FPS.",
              ranges: [{ start_seconds: 3.8, end_seconds: 6.1, duration_seconds: 2.3 }],
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Review")).toBeVisible();
    expect(screen.getByText("Main hook detected at 00:03.80.")).toBeVisible();
  });

  it("renders CTA pass and missing CTA warning", () => {
    const { rerender } = render(<ShortFormReportView report={report()} />);
    expect(screen.getByText("CALL TO ACTION")).toBeVisible();
    expect(screen.getByText("Follow for the next part.")).toBeVisible();

    rerender(
      <ShortFormReportView
        report={report({
          findings: [
            finding({
              check_id: "cta",
              category: "cta",
              status: "warning",
              title: "Call to action",
              reason: "No clear call to action detected near the ending.",
              recommendation: "Consider giving the viewer an explicit next step.",
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("No clear call to action detected near the ending.")).toBeVisible();
  });

  it("renders a single estimated speech start without repeating the backend label", () => {
    render(<ShortFormReportView report={report()} />);
    expect(screen.getByText("SPEECH")).toBeVisible();
    expect(screen.getByText("Activity start")).toBeVisible();
    expect(screen.getByText("00:00.72")).toBeVisible();
    expect(screen.getByText("Estimated")).toBeVisible();
    expect(screen.queryByText("VOICE / SPEECH ACTIVITY ESTIMATE")).not.toBeInTheDocument();
    expect(screen.queryByText("VOICE / SPEECH ACTIVITY ESTIMATE 00:00.72.")).not.toBeInTheDocument();
  });

  it("renders one global timeline with hook, pacing, and CTA", () => {
    render(<ShortFormReportView report={report()} />);
    expect(screen.getByLabelText("Short-form timeline")).toBeInTheDocument();
    expect(screen.getByLabelText("HOOK at 00:00.80")).toBeVisible();
    expect(screen.getByLabelText("PACING at 00:14.00")).toBeVisible();
    expect(screen.getByLabelText("CTA at 00:27.40")).toBeVisible();
    expect(screen.queryByLabelText("Pacing timeline")).not.toBeInTheDocument();
  });

  it("uses compact IDs and a legend for clustered pacing markers", () => {
    render(
      <ShortFormReportView
        report={report({
          media: {
            filename: "clip.mp4",
            size_bytes: 2048,
            duration_seconds: 26.8,
            width: 576,
            height: 1024,
            aspect_ratio: 0.5625,
            orientation: "portrait",
            has_audio: true,
          },
          findings: [
            finding({
              check_id: "dead_air",
              category: "pacing",
              status: "warning",
              title: "Pacing review",
              reason: "2.50 sec low-energy interval. 3 intervals found.",
              ranges: [
                { start_seconds: 12.25, end_seconds: 14.75, duration_seconds: 2.5 },
                { start_seconds: 15.75, end_seconds: 18.5, duration_seconds: 2.75 },
                { start_seconds: 19.5, end_seconds: 21.5, duration_seconds: 2 },
              ],
            }),
          ],
        })}
      />,
    );
    expect(screen.getAllByText("P1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("P2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("P3").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Short-form timeline")).toHaveTextContent("00:12.25–00:14.75");
    expect(screen.getByLabelText("Short-form timeline")).toHaveTextContent("00:15.75–00:18.50");
    expect(screen.getByLabelText("Short-form timeline")).toHaveTextContent("00:19.50–00:21.50");
    expect(screen.queryByLabelText(/^PACING at/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("P1 at 00:12.25")).toBeVisible();
    expect(screen.queryByLabelText("Pacing timeline")).not.toBeInTheDocument();
  });

  it("renders a numbered priority list", () => {
    render(
      <ShortFormReportView
        report={report({
          priorities: [
            { rank: 1, title: "Strengthen opening", check_id: "opening", timestamp_seconds: 3.8 },
            { rank: 2, title: "Review pacing gap at 00:14.00", check_id: "dead_air", timestamp_seconds: 14 },
          ],
        })}
      />,
    );
    expect(screen.getByText("REVIEW PRIORITIES")).toBeVisible();
    expect(screen.getByText("Strengthen opening")).toBeVisible();
    expect(screen.getByText("01")).toBeVisible();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("shows a single semantic notice and user-facing not-evaluated copy", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <ShortFormReportView
        onRetry={onRetry}
        report={report({
          summary: {
            total: 9,
            evaluated: 7,
            not_evaluated: 2,
            passed: 6,
            warnings: 1,
            failed: 0,
            readiness_score: 92.86,
            verification_coverage: 77.78,
          },
          findings: [
            finding({
              check_id: "orientation",
              category: "format",
              status: "pass",
              title: "Orientation",
              reason: "9:16 portrait frame detected (576 × 1024).",
              measurements: { width: 576, height: 1024 },
            }),
            finding({
              check_id: "speech_activity",
              category: "speech",
              status: "pass",
              title: "Speech",
              reason: "Energy-based activity estimate.",
              measurements: { activity_start_seconds: 0.72 },
            }),
            finding({
              check_id: "opening",
              category: "opening",
              status: "not_evaluated",
              title: "Opening",
              reason: "Opening could not be evaluated because the language-model provider failed.",
            }),
            finding({
              check_id: "cta",
              category: "cta",
              status: "not_evaluated",
              title: "Call to action",
              reason: "Call to action could not be evaluated because the language-model provider failed.",
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("SEMANTIC REVIEW")).toBeVisible();
    expect(screen.getByText("Partially unavailable")).toBeVisible();
    expect(screen.getByText(/Opening and CTA could not be evaluated/)).toBeVisible();
    expect(screen.getAllByText("Not evaluated")).toHaveLength(2);
    expect(screen.getByText("Retry preflight to evaluate the opening.")).toBeVisible();
    expect(screen.getByText("Retry preflight to evaluate the call to action.")).toBeVisible();
    expect(screen.queryByText(/language-model provider/i)).not.toBeInTheDocument();
    expect(screen.getByText("9:16 portrait")).toBeVisible();
    expect(screen.getByText("00:00.72")).toBeVisible();
    expect(screen.queryByLabelText("Short-form timeline")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry preflight" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps no-speech not-evaluated copy without a provider banner", () => {
    render(
      <ShortFormReportView
        report={report({
          findings: [
            finding({
              check_id: "opening",
              category: "opening",
              status: "not_evaluated",
              title: "Opening",
              reason: "Opening and call to action could not be evaluated because no usable speech activity was detected.",
            }),
            finding({
              check_id: "cta",
              category: "cta",
              status: "not_evaluated",
              title: "Call to action",
              reason: "Opening and call to action could not be evaluated because no usable speech activity was detected.",
            }),
          ],
        })}
      />,
    );
    expect(screen.queryByText("SEMANTIC REVIEW")).not.toBeInTheDocument();
    expect(screen.getAllByText(/no usable speech activity/i)).toHaveLength(2);
  });

  it("exposes accessible report landmarks on a compact mobile width", () => {
    render(
      <div style={{ width: 360 }}>
        <ShortFormReportView report={report()} />
      </div>,
    );
    expect(screen.getByRole("heading", { name: "TikTok" })).toBeVisible();
    expect(screen.getByLabelText("Readiness score 88.89 out of 100")).toBeInTheDocument();
    expect(screen.getByLabelText("Short-form timeline")).toBeInTheDocument();
    expect(screen.getByText("RESOLUTION")).toBeVisible();
  });
});
