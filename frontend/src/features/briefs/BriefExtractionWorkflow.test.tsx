import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { jsonResponse } from "../../test/testData";
import { ReviewWorkspace } from "../review/ReviewWorkspace";


const BRIEF =
  "Mention AcmeVPN in the first 60 seconds and use code CREATOR25.";

function extractionResponse() {
  return {
    requirements: [
      {
        id: "req_ai_brand",
        type: "required_mention_before",
        description: "Mention AcmeVPN in the first minute",
        value: "AcmeVPN",
        before_seconds: 60,
        source_text: "Mention AcmeVPN in the first 60 seconds",
      },
      {
        id: "req_ai_coupon",
        type: "required_exact_token",
        description: "Use the exact promo code",
        value: "CREATOR25",
        before_seconds: null,
        source_text: "use code CREATOR25",
      },
    ],
    meta: {
      provider: "test-provider",
      model: "test-model",
      prompt_version: "1.1",
      requirement_count: 2,
    },
  };
}

async function enterBrief(value = BRIEF) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Campaign document"), value);
  return user;
}

function successfulExtractionFetch() {
  return vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(extractionResponse()));
}

function urlExtractionResponse() {
  return {
    requirements: [
      {
        id: "req_ai_url",
        type: "required_url",
        description: "Mention the campaign URL",
        value: "acmevpn.com/creator",
        before_seconds: null,
        source_text: "Mention acmevpn.com/creator",
      },
    ],
    meta: {
      provider: "test-provider",
      model: "test-model",
      prompt_version: "1.1",
      requirement_count: 1,
    },
  };
}

describe("sponsor brief extraction workflow", () => {
  it("accepts a sponsor brief as an editorial document", async () => {
    render(<ReviewWorkspace />);
    await enterBrief();

    expect(screen.getByLabelText("Campaign document")).toHaveValue(BRIEF);
    expect(screen.getByText("Optional when requirements are entered manually.")).toBeVisible();
  });

  it("validates the extract action before calling the backend", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Extract requirements" }));

    expect(
      await screen.findByText("Enter a sponsor brief before extracting requirements."),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders successful extraction in a staged human-review area", async () => {
    vi.stubGlobal("fetch", successfulExtractionFetch());
    render(<ReviewWorkspace />);
    const user = await enterBrief();

    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    expect(await screen.findByText("Extracted checklist")).toBeVisible();
    expect(screen.getByText("AcmeVPN")).toBeVisible();
    expect(screen.getByText("CREATOR25")).toBeVisible();
    expect(screen.getByText("HUMAN REVIEW REQUIRED")).toBeVisible();
    expect(screen.getAllByRole("heading", { name: /Requirement \d/ })).toHaveLength(1);
  });

  it("appends extracted rules into the existing editable requirement editor", async () => {
    vi.stubGlobal("fetch", successfulExtractionFetch());
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    await user.click(
      await screen.findByRole("button", { name: "Append 2 to checklist" }),
    );

    const extractedDescription = screen.getByLabelText("Requirement 2 description");
    expect(extractedDescription).toHaveValue("Mention AcmeVPN in the first minute");
    await user.clear(extractedDescription);
    await user.type(extractedDescription, "Mention sponsor before 01:00");
    expect(extractedDescription).toHaveValue("Mention sponsor before 01:00");
    expect(screen.getByLabelText("Requirement 2 deadline in seconds")).toHaveValue(60);
  });

  it("keeps provenance visible after a staged rule is appended", async () => {
    vi.stubGlobal("fetch", successfulExtractionFetch());
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));
    await user.click(
      await screen.findByRole("button", { name: "Append 2 to checklist" }),
    );

    const sourceSummary = screen.getAllByText("Source from sponsor brief")[0];
    await user.click(sourceSummary);

    expect(
      screen.getByText("“Mention AcmeVPN in the first 60 seconds”"),
    ).toBeVisible();
  });

  it("allows an extracted requirement to be removed from the shared editor", async () => {
    vi.stubGlobal("fetch", successfulExtractionFetch());
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));
    await user.click(
      await screen.findByRole("button", { name: "Append 2 to checklist" }),
    );

    await user.click(screen.getByRole("button", { name: "Remove requirement 2" }));

    expect(screen.queryByDisplayValue("Mention AcmeVPN in the first minute")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Use the exact promo code")).toBeVisible();
  });

  it("does not silently replace a manual requirement", async () => {
    vi.stubGlobal("fetch", successfulExtractionFetch());
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.type(
      screen.getByLabelText("Requirement 1 description"),
      "Manual disclosure rule",
    );
    await user.type(
      screen.getByLabelText("Requirement 1 target value"),
      "sponsored by",
    );

    await user.click(screen.getByRole("button", { name: "Extract requirements" }));
    await screen.findByText("Extracted checklist");

    expect(screen.getByLabelText("Requirement 1 description")).toHaveValue(
      "Manual disclosure rule",
    );
    expect(screen.queryByLabelText("Requirement 2 description")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Append 2 to checklist" }));
    expect(screen.getByLabelText("Requirement 1 description")).toHaveValue(
      "Manual disclosure rule",
    );
    expect(screen.getByLabelText("Requirement 2 description")).toHaveValue(
      "Mention AcmeVPN in the first minute",
    );
  });

  it("can exclude a staged candidate before appending", async () => {
    vi.stubGlobal("fetch", successfulExtractionFetch());
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    await user.click(
      await screen.findByRole("button", {
        name: "Exclude extracted requirement Use the exact promo code",
      }),
    );

    expect(screen.getByRole("button", { name: "Append 1 to checklist" })).toBeVisible();
    expect(screen.queryByText("CREATOR25")).not.toBeInTheDocument();
  });

  it("preserves the brief and manual workflow after provider failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "LLM_PROVIDER_CONFIGURATION_ERROR",
              message: "private config",
              details: null,
            },
          },
          503,
        ),
      ),
    );
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    expect(
      await screen.findByText(
        "Requirement extraction is not configured. You can keep adding rules manually.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Campaign document")).toHaveValue(BRIEF);
    await user.type(
      screen.getByLabelText("Requirement 1 description"),
      "Manual requirement",
    );
    expect(screen.getByLabelText("Requirement 1 description")).toHaveValue(
      "Manual requirement",
    );
  });

  it("retries a temporary failure without clearing the brief", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "LLM_PROVIDER_TIMEOUT",
              message: "timeout",
              details: null,
            },
          },
          504,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(extractionResponse()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    await user.click(await screen.findByRole("button", { name: "Retry extraction" }));

    expect(await screen.findByText("Extracted checklist")).toBeVisible();
    expect(screen.getByLabelText("Campaign document")).toHaveValue(BRIEF);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prevents duplicate extraction requests while one is active", async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    await enterBrief();
    const button = screen.getByRole("button", { name: "Extract requirements" });

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Reading sponsor brief…" })).toBeDisabled();
    resolveRequest(jsonResponse(extractionResponse()));
    await screen.findByText("Extracted checklist");
  });

  it("announces extraction status and safe errors accessibly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "LLM_PROVIDER_UNAVAILABLE",
              message: "unavailable",
              details: null,
            },
          },
          503,
        ),
      ),
    );
    render(<ReviewWorkspace />);
    const user = await enterBrief();
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("temporarily unavailable");
    expect(screen.getByLabelText("Campaign document")).toHaveAttribute(
      "aria-describedby",
      "sponsor-brief-note sponsor-brief-status",
    );
  });

  it("stages an extracted URL with its source provenance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(urlExtractionResponse())),
    );
    render(<ReviewWorkspace />);
    const user = await enterBrief("Mention acmevpn.com/creator.");

    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    const stagedReview = (await screen.findByRole("heading", {
      name: "Extracted checklist",
    })).closest(".extraction-review");
    expect(stagedReview).not.toBeNull();
    const staged = within(stagedReview as HTMLElement);
    expect(staged.getByText("Required URL")).toBeVisible();
    expect(staged.getByText("acmevpn.com/creator")).toBeVisible();
    expect(staged.getByText("“Mention acmevpn.com/creator”")).toBeVisible();
  });

  it("appends an extracted URL into the shared requirement editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(urlExtractionResponse())),
    );
    render(<ReviewWorkspace />);
    const user = await enterBrief("Mention acmevpn.com/creator.");
    await user.click(screen.getByRole("button", { name: "Extract requirements" }));

    await user.click(
      await screen.findByRole("button", { name: "Append 1 to checklist" }),
    );

    expect(screen.getByLabelText("Requirement 2 type")).toHaveValue(
      "required_url",
    );
    expect(screen.getByLabelText("Requirement 2 target value")).toHaveValue(
      "acmevpn.com/creator",
    );
  });
});
