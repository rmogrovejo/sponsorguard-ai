import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { DRAFT_STORAGE_KEY } from "./features/persistence/draftKeys";
import { sampleDraft, writeDraft } from "./features/persistence/draftTestFixtures";

function mp4File(name = "clip.mp4"): File {
  return new File([new Uint8Array(32)], name, { type: "video/mp4" });
}

describe("CreatorPreflight shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on Short-Form and keeps Sponsored Content accessible", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("navigation", { name: "CreatorPreflight" })).toBeInTheDocument();
    expect(screen.getByText("CreatorPreflight", { selector: ".wordmark__name" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Know what to fix before you publish.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /short-form/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );

    await user.click(screen.getByRole("button", { name: /sponsored content/i }));

    expect(screen.getByRole("heading", { name: "Pre-publish review" })).toBeVisible();
    expect(screen.getByText("Sponsored Content / SponsorGuard")).toBeVisible();
    expect(screen.getByRole("button", { name: "Analyze review" })).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "Know what to fix before you publish.",
      }),
    ).toBeNull();
  });

  it("keeps later modules as non-interactive placeholders", () => {
    render(<App />);
    expect(screen.getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reviews/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("preserves independent Short-Form state when switching modules", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: undefined,
    });
    render(<App />);

    await user.upload(screen.getByLabelText("Choose MP4"), mp4File());
    expect(await screen.findByText("clip.mp4")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /sponsored content/i }));
    expect(screen.getByRole("heading", { name: "Pre-publish review" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /short-form/i }));
    expect(screen.getByText("clip.mp4")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start preflight" })).toBeEnabled();
  });

  it("restores sponsored and short-form drafts without calling APIs", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    writeDraft();
    render(<App />);

    expect(screen.getByRole("heading", { name: "Pre-publish review" })).toBeVisible();
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(screen.getByLabelText("Campaign document")).toHaveValue(
      "Mention AcmeVPN and the code SAVE20 before the first minute.",
    );
    expect(screen.getByLabelText("Requirement 1 description")).toHaveValue("Mention AcmeVPN");
    expect(screen.getByLabelText("Requirement 2 target value")).toHaveValue("SAVE20");
    expect(screen.getByLabelText("SRT transcript")).toHaveValue(
      "1\n00:00:00,000 --> 00:00:02,000\nHello from the restored SRT.",
    );
    expect(screen.queryByText("READINESS")).not.toBeInTheDocument();
    expect(screen.queryByText("Compliance score")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /short-form/i }));
    expect(screen.getByRole("radio", { name: /Instagram Reels/i })).toBeChecked();
    expect(screen.getByText("Local video must be selected again after refresh.")).toBeVisible();
    expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start preflight" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toContain("video/mp4");
  });

  it("still starts after corrupted storage and keeps the workflow usable", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{not-json");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Know what to fix before you publish." }),
    ).toBeVisible();
    expect(screen.getByText("An invalid saved draft could not be restored.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start preflight" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /sponsored content/i }));
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Analyze review" })).toBeEnabled();
  });

  it("asks before clearing a meaningful draft and isolates the reset", async () => {
    const user = userEvent.setup();
    writeDraft();
    render(<App />);

    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    await user.click(screen.getByRole("button", { name: "Start new draft" }));
    expect(screen.getByRole("alertdialog", { name: "Start a new review?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );

    await user.click(screen.getByRole("button", { name: "Start new draft" }));
    await user.click(screen.getByRole("button", { name: "Clear draft" }));
    expect(
      screen.getByRole("heading", { name: "Know what to fix before you publish." }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /TikTok/i })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /sponsored content/i }));
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue("");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("shows saved locally after autosave and remains usable when storage throws", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sponsored content/i }));
    await user.type(screen.getByLabelText("Campaign or review name"), "Local campaign");
    expect(await screen.findByText("Saved locally")).toBeVisible();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await user.type(screen.getByLabelText("Campaign or review name"), " more");
    expect(await screen.findByText("Local save unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Analyze review" })).toBeEnabled();
  });
});
