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

  it("offers a nontechnical Required URL rule with a URL-focused field", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);

    await user.selectOptions(
      screen.getByLabelText("Requirement 1 type"),
      "required_url",
    );

    expect(screen.getByLabelText("Campaign URL")).toHaveAttribute(
      "placeholder",
      "e.g. acmevpn.com/creator",
    );
    expect(
      screen.queryByLabelText("Requirement 1 deadline in seconds"),
    ).not.toBeInTheDocument();
  });

  it("allows a manually created URL requirement to be edited", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    await user.selectOptions(
      screen.getByLabelText("Requirement 1 type"),
      "required_url",
    );
    const campaignUrl = screen.getByLabelText("Campaign URL");

    await user.type(campaignUrl, "acmevpn.com/creator");
    await user.clear(campaignUrl);
    await user.type(campaignUrl, "https://www.acmevpn.com/partner/");

    expect(campaignUrl).toHaveValue("https://www.acmevpn.com/partner/");
  });

  it("associates an invalid URL message with the campaign URL field", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    await user.type(
      screen.getByLabelText("Campaign or review name"),
      "AcmeVPN campaign",
    );
    await user.selectOptions(
      screen.getByLabelText("Requirement 1 type"),
      "required_url",
    );
    await user.type(
      screen.getByLabelText("Requirement 1 description"),
      "Mention campaign URL",
    );
    const campaignUrl = screen.getByLabelText("Campaign URL");
    await user.type(campaignUrl, "ftp://not valid");
    await user.type(screen.getByLabelText("SRT transcript"), "not empty");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByText(
        "Enter a valid campaign URL such as acmevpn.com/creator.",
      ),
    ).toBeVisible();
    expect(campaignUrl).toHaveAttribute("aria-invalid", "true");
    expect(campaignUrl).toHaveAccessibleDescription(
      "Enter a valid campaign URL such as acmevpn.com/creator.",
    );
  });

  it("offers and edits a Required talking point in nontechnical language", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);

    await user.selectOptions(
      screen.getByLabelText("Requirement 1 type"),
      "required_talking_point",
    );
    const meaning = screen.getByLabelText("What viewers should understand");
    await user.type(meaning, "The product reduces editing time");

    expect(meaning).toHaveValue("The product reduces editing time");
    expect(meaning).toHaveAttribute(
      "placeholder",
      "e.g. The product reduces editing time",
    );
    expect(
      screen.queryByLabelText("Requirement 1 deadline in seconds"),
    ).not.toBeInTheDocument();
  });

  it("offers and edits a Forbidden claim with an accessible meaning label", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);

    await user.selectOptions(
      screen.getByLabelText("Requirement 1 type"),
      "forbidden_claim",
    );
    const meaning = screen.getByLabelText(
      "Meaning the creator must not communicate",
    );
    await user.type(meaning, "The VPN makes users completely untraceable");

    expect(meaning).toHaveValue(
      "The VPN makes users completely untraceable",
    );
  });

  it("associates semantic target validation with the meaning field", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    await user.type(
      screen.getByLabelText("Campaign or review name"),
      "Semantic review",
    );
    await user.selectOptions(
      screen.getByLabelText("Requirement 1 type"),
      "required_talking_point",
    );
    await user.type(
      screen.getByLabelText("Requirement 1 description"),
      "Explain the benefit",
    );
    await user.type(screen.getByLabelText("SRT transcript"), "not empty");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    const meaning = screen.getByLabelText("What viewers should understand");
    expect(
      await screen.findByText("Describe what viewers should understand."),
    ).toBeVisible();
    expect(meaning).toHaveAttribute("aria-invalid", "true");
  });
});
