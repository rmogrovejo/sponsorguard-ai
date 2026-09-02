import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewWorkspace } from "../review/ReviewWorkspace";

describe("requirements workspace", () => {
  it("adds requirements", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);

    await user.click(screen.getByRole("button", { name: "Add requirement" }));

    expect(screen.getByRole("heading", { name: "Requirement 1" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Requirement 2" })).toBeVisible();
  });

  it("edits requirement fields", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);

    const description = screen.getByLabelText("Requirement 1 description");
    const target = screen.getByLabelText("Requirement 1 target value");
    await user.type(description, "Mention AcmeVPN");
    await user.type(target, "AcmeVPN");

    expect(description).toHaveValue("Mention AcmeVPN");
    expect(target).toHaveValue("AcmeVPN");
  });

  it("removes requirements", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);

    await user.click(screen.getByRole("button", { name: "Remove requirement 1" }));

    expect(screen.queryByRole("heading", { name: "Requirement 1" })).not.toBeInTheDocument();
    expect(screen.getByText("NO RULES DEFINED")).toBeVisible();
  });

  it("shows the deadline only for timing requirements", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    const type = screen.getByLabelText("Requirement 1 type");

    expect(
      screen.queryByLabelText("Requirement 1 deadline in seconds"),
    ).not.toBeInTheDocument();

    await user.selectOptions(type, "required_mention_before");
    expect(
      screen.getByLabelText("Requirement 1 deadline in seconds"),
    ).toHaveValue(60);

    await user.selectOptions(type, "forbidden_phrase");
    expect(
      screen.queryByLabelText("Requirement 1 deadline in seconds"),
    ).not.toBeInTheDocument();
  });

  it("prevents an invalid review from reaching the API", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(await screen.findByText("Enter a campaign or review name.")).toBeVisible();
    expect(screen.getByText("Describe what should be checked.")).toBeVisible();
    expect(screen.getByText("Enter the phrase or token to check.")).toBeVisible();
    expect(
      screen.getByText("Paste or upload an SRT transcript before analyzing."),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("associates deadline validation with the timing input", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    await user.type(
      screen.getByLabelText("Campaign or review name"),
      "AcmeVPN campaign",
    );
    await user.selectOptions(
      screen.getByLabelText("Requirement 1 type"),
      "required_mention_before",
    );
    await user.type(
      screen.getByLabelText("Requirement 1 description"),
      "Mention AcmeVPN early",
    );
    await user.type(
      screen.getByLabelText("Requirement 1 target value"),
      "AcmeVPN",
    );
    const deadline = screen.getByLabelText("Requirement 1 deadline in seconds");
    await user.clear(deadline);
    fireEvent.change(deadline, { target: { value: "-1" } });
    await user.type(screen.getByLabelText("SRT transcript"), "not empty");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByText("Enter a deadline of zero seconds or more."),
    ).toBeVisible();
    expect(deadline).toHaveAttribute("aria-invalid", "true");
  });
});
