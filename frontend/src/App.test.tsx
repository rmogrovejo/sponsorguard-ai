import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { DRAFT_STORAGE_KEY } from "./features/persistence/draftKeys";
import { sampleDraft, writeDraft } from "./features/persistence/draftTestFixtures";
import { SETTINGS_STORAGE_KEY } from "./features/settings/settingsKeys";
import { pngFile, writeSettings } from "./features/settings/settingsTestFixtures";

function mp4File(name = "clip.mp4"): File {
  return new File([new Uint8Array(32)], name, { type: "video/mp4" });
}

function mastheadProductName(): HTMLElement {
  const node = document.querySelector(".masthead .wordmark__name");
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

describe("CreatorPreflight shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on Short-Form and keeps Sponsored Content accessible", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("navigation", { name: "CreatorPreflight" })).toBeInTheDocument();
    expect(mastheadProductName()).toHaveTextContent("CreatorPreflight");
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

  it("opens Audience Pulse and Settings from the shell", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("button", { name: /audience pulse/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /audience pulse/i }));
    expect(
      screen.getByRole("heading", {
        name: "Understand what your audience is actually telling you.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Analyze audience" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByRole("heading", { name: "Workspace appearance and defaults." })).toBeVisible();
    expect(screen.getByLabelText("Product name")).toBeVisible();
    expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute("aria-current", "page");
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

  it("applies branding, accent, density, and title from Settings without CSS injection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    const name = screen.getByLabelText("Product name");
    await user.clear(name);
    await user.type(name, "Northwind Preflight");
    expect(screen.getAllByText("Northwind Preflight", { selector: ".wordmark__name" }).length).toBeGreaterThan(0);
    expect(document.title).toBe("Northwind Preflight");

    await user.clear(screen.getByLabelText("Tagline"));
    await user.type(screen.getByLabelText("Tagline"), "Proof the cut first.");
    expect(screen.getAllByText("Proof the cut first.").length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText("Text mark"));
    await user.type(screen.getByLabelText("Text mark"), "NP");
    expect(screen.getAllByText("NP").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("radio", { name: "Olive" }));
    expect(document.documentElement.dataset.accent).toBe("olive");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
    expect(document.documentElement.style.getPropertyValue("--color-pass")).toBe("");

    await user.selectOptions(screen.getByLabelText("Heading typography"), "classic");
    await user.selectOptions(screen.getByLabelText("Interface typography"), "humanist");
    expect(document.documentElement.dataset.heading).toBe("classic");
    expect(document.documentElement.dataset.interface).toBe("humanist");

    await user.click(screen.getByRole("radio", { name: "Compact" }));
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(screen.getByText("PREFLIGHT / 02")).toHaveClass("mono-label");
  });

  it("accepts a raster logo and rejects SVG", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.upload(screen.getByLabelText("Upload logo"), pngFile());
    await waitFor(() => {
      expect(document.querySelectorAll(".wordmark__mark img").length).toBeGreaterThan(0);
    });
    document.querySelectorAll(".wordmark__mark img").forEach((image) => {
      expect(image.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    });

    const svg = new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "brand.svg", {
      type: "image/svg+xml",
    });
    fireEvent.change(screen.getByLabelText("Upload logo"), { target: { files: [svg] } });
    expect(await screen.findByText("SVG logos are not supported.")).toBeVisible();
    expect(screen.queryByAltText(/C:\\/)).not.toBeInTheDocument();
  });

  it("keeps the current Short-Form draft platform when the default changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("radio", { name: /TikTok/i })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.selectOptions(screen.getByLabelText("Short-Form preset"), "instagram_reels");
    await user.click(screen.getByRole("button", { name: /short-form/i }));
    expect(screen.getByRole("radio", { name: /TikTok/i })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Start new draft" }));
    expect(screen.getByRole("radio", { name: /Instagram Reels/i })).toBeChecked();
  });

  it("restores settings independently of the working draft", async () => {
    const user = userEvent.setup();
    writeDraft();
    writeSettings();
    render(<App />);
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(mastheadProductName()).toHaveTextContent("StudioPreflight");
    expect(document.documentElement.dataset.accent).toBe("olive");

    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Restore defaults" }),
    );
    expect(mastheadProductName()).toHaveTextContent("CreatorPreflight");
    expect(document.documentElement.dataset.accent).toBe("terracotta");
    await user.click(screen.getByRole("button", { name: /sponsored content/i }));
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain("AcmeVPN September Campaign");
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it("falls back from corrupted settings without losing a draft", async () => {
    writeDraft();
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, "{not-settings");
    render(<App />);
    expect(mastheadProductName()).toHaveTextContent("CreatorPreflight");
    expect(screen.getByText("Workspace settings could not be restored.")).toBeVisible();
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(document.documentElement.dataset.accent).toBe("terracotta");
  });

  it("keeps analysis available when settings cannot be saved", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await user.type(screen.getByLabelText("Product name"), "X");
    expect(await screen.findByText("Settings save unavailable")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /sponsored content/i }));
    expect(screen.getByRole("button", { name: "Analyze review" })).toBeEnabled();
    expect(screen.getByText("Settings save unavailable")).toBeVisible();
  });
});
