import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("keeps the heading and description in the same copy block", () => {
    render(
      <SectionHeader
        step="01 / REVIEW"
        title="Campaign identity"
        titleId="campaign-heading"
        description="Name this review so its findings remain easy to identify."
        action={<button type="button">Extract requirements</button>}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Campaign identity" });
    const description = screen.getByText(
      "Name this review so its findings remain easy to identify.",
    );
    expect(heading.parentElement).toBe(description.parentElement);
    expect(heading.parentElement).toHaveClass("review-section__copy");
    expect(screen.getByText("01 / REVIEW")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extract requirements" })).toBeInTheDocument();
  });
});
