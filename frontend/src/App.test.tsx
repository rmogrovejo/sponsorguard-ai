import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

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
});
