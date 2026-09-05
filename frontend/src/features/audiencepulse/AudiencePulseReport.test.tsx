import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../i18n/useTranslation";
import type { AudiencePulseReport } from "../../types/audiencePulse";
import { AudiencePulseReportView } from "./AudiencePulseReport";

const PARTIAL: AudiencePulseReport = {
  source: "youtube",
  analysis_status: "not_evaluated",
  analysis_error_code: "LLM_PROVIDER_RATE_LIMITED",
  comments_loaded: 2,
  comments_classified: 0,
  comments_actionable: 0,
  comments: [
    { id: "c1", text: "Does this work on Windows 11?", author: "Alex" },
    { id: "c2", text: "Make an AMD version", author: null },
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

const COMPLETE: AudiencePulseReport = {
  source: "manual",
  analysis_status: "complete",
  analysis_error_code: null,
  comments_loaded: 8,
  comments_classified: 8,
  comments_actionable: 8,
  comments: [
    { id: "c1", text: "Does this work on Windows 11?", author: null },
  ],
  video: null,
  signals: [
    { category: "question", count: 8, percentage: 100 },
    { category: "positive", count: 0, percentage: 0 },
    { category: "content_request", count: 0, percentage: 0 },
    { category: "funny", count: 0, percentage: 0 },
    { category: "constructive_criticism", count: 0, percentage: 0 },
    { category: "negative", count: 0, percentage: 0 },
    { category: "confusion", count: 0, percentage: 0 },
    { category: "low_information", count: 0, percentage: null },
  ],
  themes: [
    {
      rank: 1,
      summary: "Viewers repeatedly request hardware-specific versions.",
      comment_count: 3,
      evidence_comment_ids: ["c1"],
    },
  ],
  reply_worthy: [],
  opportunities: [
    {
      rank: 1,
      title: "Make a Windows 11 compatibility follow-up",
      grounded_in_count: 1,
      evidence_comment_ids: ["c1"],
    },
  ],
};

describe("AudiencePulseReportView partial state", () => {
  it("shows loaded comments and NOT EVALUATED without fake percentages", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <LocaleProvider locale="en">
        <AudiencePulseReportView report={PARTIAL} onRetryAnalysis={onRetry} />
      </LocaleProvider>,
    );
    expect(screen.getByText("YouTube / Shorts · 2 comments")).toBeVisible();
    expect(screen.getByText(/PC Tips/)).toBeVisible();
    expect(screen.getByText("“Does this work on Windows 11?”")).toBeVisible();
    expect(screen.getByText("NOT EVALUATED")).toBeVisible();
    expect(screen.queryByText("AUDIENCE SIGNALS")).not.toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry semantic analysis/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("localizes unavailable state in Spanish", () => {
    render(
      <LocaleProvider locale="es">
        <AudiencePulseReportView report={PARTIAL} />
      </LocaleProvider>,
    );
    expect(screen.getByText("NO EVALUADO")).toBeVisible();
    expect(screen.getByText("YouTube / Shorts · 2 comentarios")).toBeVisible();
  });

  it("keeps original comment text in a Spanish UI", () => {
    render(
      <LocaleProvider locale="es">
        <AudiencePulseReportView report={COMPLETE} manualSource="tiktok" />
      </LocaleProvider>,
    );
    expect(screen.getByText("TikTok · 8 comentarios")).toBeVisible();
    expect(screen.getByText("“Does this work on Windows 11?”")).toBeVisible();
    expect(screen.queryByText(/¿Funciona/)).not.toBeInTheDocument();
  });

  it("separates theme index, summary, and count", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <AudiencePulseReportView report={COMPLETE} manualSource="instagram" />
      </LocaleProvider>,
    );
    expect(screen.getByText("Instagram / Reels · 8 comments")).toBeVisible();
    expect(container.querySelector(".audience-pulse-entry__index")).toHaveTextContent("01");
    expect(
      screen.getByRole("heading", {
        name: "Viewers repeatedly request hardware-specific versions.",
      }),
    ).toBeVisible();
    expect(screen.getByText("3 comments")).toBeVisible();
  });
});
