import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../i18n/useTranslation";
import { translate } from "../../i18n/translations";
import type { AudiencePulseReport } from "../../types/audiencePulse";
import * as audiencePulseApi from "../../services/audiencePulseApi";
import { AudiencePulseWorkspace } from "./AudiencePulseWorkspace";

const COMPLETE: AudiencePulseReport = {
  source: "manual",
  analysis_status: "complete",
  analysis_error_code: null,
  comments_loaded: 2,
  comments_classified: 2,
  comments_actionable: 2,
  comments: [
    { id: "c1", text: "Does this work on Windows 11?", author: null },
    { id: "c2", text: "Make an AMD version", author: null },
  ],
  video: null,
  signals: [
    { category: "question", count: 1, percentage: 50 },
    { category: "content_request", count: 1, percentage: 50 },
    { category: "positive", count: 0, percentage: 0 },
    { category: "funny", count: 0, percentage: 0 },
    { category: "constructive_criticism", count: 0, percentage: 0 },
    { category: "negative", count: 0, percentage: 0 },
    { category: "confusion", count: 0, percentage: 0 },
    { category: "low_information", count: 0, percentage: null },
  ],
  themes: [
    {
      rank: 1,
      summary: "Viewers want hardware-specific follow-ups",
      comment_count: 2,
      evidence_comment_ids: ["c1", "c2"],
    },
  ],
  reply_worthy: [],
  opportunities: [
    {
      rank: 1,
      title: "Make an AMD version",
      grounded_in_count: 1,
      evidence_comment_ids: ["c2"],
    },
  ],
};

function renderWorkspace(
  locale: "en" | "es" = "en",
  props: Partial<Parameters<typeof AudiencePulseWorkspace>[0]> = {},
) {
  return render(
    <LocaleProvider locale={locale}>
      <AudiencePulseWorkspace {...props} />
    </LocaleProvider>,
  );
}

describe("AudiencePulseWorkspace source modes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in YouTube mode and hides the manual textarea", () => {
    renderWorkspace();
    expect(screen.getByRole("radio", { name: "YouTube / Shorts" })).toBeChecked();
    expect(screen.getByLabelText("YouTube / Shorts URL")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Paste comments" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Comment source")).not.toBeInTheDocument();
    expect(document.querySelector(".audience-pulse-input")).not.toBeNull();
  });

  it("treats paste comments as an alternative mode with a platform selector", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole("radio", { name: "Paste comments" }));
    expect(screen.getByRole("radio", { name: "Paste comments" })).toBeChecked();
    expect(screen.queryByLabelText("YouTube / Shorts URL")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Paste comments" })).toBeVisible();
    expect(screen.getByLabelText("Comment source")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Paste comments" })).toHaveClass(
      "audience-pulse-field__comments",
    );
    const select = screen.getByLabelText("Comment source");
    expect(within(select).getByRole("option", { name: "TikTok" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Instagram / Reels" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Stream / Twitch" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Other" })).toBeInTheDocument();
  });

  it("restores an old comments-only draft into manual mode", () => {
    renderWorkspace("en", {
      initialCommentsText: "Does this work on Windows 11?",
    });
    expect(screen.getByRole("radio", { name: "Paste comments" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Paste comments" })).toHaveValue(
      "Does this work on Windows 11?",
    );
    expect(screen.queryByLabelText("YouTube / Shorts URL")).not.toBeInTheDocument();
  });

  it("localizes manual platform labels in Spanish", async () => {
    const user = userEvent.setup();
    renderWorkspace("es");
    await user.click(screen.getByRole("radio", { name: "Pegar comentarios" }));
    expect(screen.queryByLabelText("URL de YouTube / Shorts")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Pegar comentarios" })).toBeVisible();
    expect(screen.queryByText("Carga automática de comentarios públicos.")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "TikTok · Instagram · clips de stream · otras plataformas. Un comentario por línea.",
      ),
    ).toBeVisible();
    const select = screen.getByLabelText("Origen de los comentarios");
    expect(within(select).getByRole("option", { name: "TikTok" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Instagram / Reels" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Stream / Twitch" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Otro" })).toBeInTheDocument();
  });

  it("sends only the YouTube URL with the selected analysis language", async () => {
    const user = userEvent.setup();
    const analyze = vi
      .spyOn(audiencePulseApi, "analyzeAudiencePulse")
      .mockResolvedValue({ ...COMPLETE, source: "youtube" });
    renderWorkspace("es");
    await user.type(
      screen.getByLabelText("URL de YouTube / Shorts"),
      "https://youtube.com/shorts/abcdefghijk",
    );
    await user.click(screen.getByRole("button", { name: "Analizar audiencia" }));
    expect(analyze).toHaveBeenCalledWith({
      youtube_url: "https://youtube.com/shorts/abcdefghijk",
      analysis_language: "es",
    });
  });

  it("sends only pasted comments in manual mode and keeps original text", async () => {
    const user = userEvent.setup();
    const analyze = vi
      .spyOn(audiencePulseApi, "analyzeAudiencePulse")
      .mockResolvedValue(COMPLETE);
    renderWorkspace("en", { initialCommentsText: "Does this work on Windows 11?" });
    await user.selectOptions(screen.getByLabelText("Comment source"), "tiktok");
    await user.click(screen.getByRole("button", { name: "Analyze audience" }));
    expect(analyze).toHaveBeenCalledWith({
      comments_text: "Does this work on Windows 11?",
      analysis_language: "en",
    });
    expect(screen.getByText("“Does this work on Windows 11?”")).toBeVisible();
    expect(screen.getByText("TikTok · 2 comments")).toBeVisible();
  });
});

describe("Audience Pulse copy", () => {
  it("keeps EN/ES platform labels without implying TikTok APIs", () => {
    expect(translate("en", "audiencePulse.urlHint")).toMatch(/Automatic loading/);
    expect(translate("es", "audiencePulse.urlHint")).toBe(
      "Carga automática de comentarios públicos.",
    );
    expect(translate("en", "audiencePulse.pasteHint")).toMatch(/TikTok · Instagram/);
    expect(translate("es", "audiencePulse.platformOther")).toBe("Otro");
    expect(translate("es", "audiencePulse.sourceBody")).not.toMatch(/API de TikTok/i);
  });
});
