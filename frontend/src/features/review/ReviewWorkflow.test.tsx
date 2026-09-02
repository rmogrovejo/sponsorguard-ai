import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnalyzeComplianceRequest } from "../../types/compliance";
import {
  jsonResponse,
  responseForRequest,
  VALID_SRT,
} from "../../test/testData";
import { ReviewWorkspace } from "./ReviewWorkspace";

async function fillFirstRequirement(
  type: "required_mention" | "required_mention_before" = "required_mention",
) {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Campaign or review name"),
    "AcmeVPN September Campaign",
  );
  if (type !== "required_mention") {
    await user.selectOptions(screen.getByLabelText("Requirement 1 type"), type);
  }
  await user.type(
    screen.getByLabelText("Requirement 1 description"),
    type === "required_mention_before"
      ? "Mention AcmeVPN before 01:00"
      : "Mention AcmeVPN",
  );
  await user.type(
    screen.getByLabelText("Requirement 1 target value"),
    "AcmeVPN",
  );
  fireEvent.change(screen.getByLabelText("SRT transcript"), {
    target: { value: VALID_SRT },
  });
  return user;
}

function requestFromInit(init: RequestInit | undefined): AnalyzeComplianceRequest {
  return JSON.parse(String(init?.body)) as AnalyzeComplianceRequest;
}

function successfulFetch(status: "pass" | "fail" = "pass") {
  return vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
    const request = requestFromInit(init);
    return jsonResponse(responseForRequest(request, status));
  });
}

describe("review workflow", () => {
  it("submits a valid review to the configured compliance endpoint", async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement("required_mention_before");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    await screen.findByRole("heading", {
      name: "AcmeVPN September Campaign",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://127.0.0.1:8000/api/v1/compliance/analyze",
    );
  });

  it("sends the exact typed backend payload", async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement("required_mention_before");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const request = requestFromInit(fetchMock.mock.calls[0][1]);
    expect(request).toEqual({
      requirements: [
        {
          id: expect.stringMatching(/^req_[a-f0-9]{32}$/),
          type: "required_mention_before",
          description: "Mention AcmeVPN before 01:00",
          value: "AcmeVPN",
          before_seconds: 60,
        },
      ],
      transcript: { format: "srt", content: VALID_SRT },
    });
  });

  it("renders a mixed compliance report and exact score", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = requestFromInit(init);
      return jsonResponse({
        summary: {
          total: 2,
          passed: 1,
          warnings: 0,
          failed: 1,
          compliance_score: 50,
        },
        results: [
          {
            requirement_id: request.requirements[0].id,
            status: "pass",
            reason_code: "REQUIRED_MENTION_FOUND",
            reason: "Required mention found.",
            source_segment_index: 1,
            timestamp_seconds: 38,
            evidence: "Today's video is sponsored by AcmeVPN.",
          },
          {
            requirement_id: request.requirements[1].id,
            status: "fail",
            reason_code: "REQUIRED_TOKEN_MISSING",
            reason: "Required token CREATOR25 was not found.",
            source_segment_index: null,
            timestamp_seconds: null,
            evidence: null,
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement();
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.selectOptions(
      screen.getByLabelText("Requirement 2 type"),
      "required_exact_token",
    );
    await user.type(
      screen.getByLabelText("Requirement 2 description"),
      "Mention promo code CREATOR25",
    );
    await user.type(
      screen.getByLabelText("Requirement 2 target value"),
      "CREATOR25",
    );

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    const score = await screen.findByLabelText("Compliance score 50 out of 100");
    expect(within(score).getByText("50")).toBeVisible();
    expect(screen.getByLabelText("Compliance status: Pass")).toBeVisible();
    expect(screen.getByLabelText("Compliance status: Fail")).toBeVisible();
    expect(screen.getByText("Mention promo code CREATOR25")).toBeVisible();
    expect(screen.getByText("Required token CREATOR25 was not found.")).toBeVisible();
  });

  it("presents timestamped evidence as an exact review artifact", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement();

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(await screen.findByText("00:38")).toBeVisible();
    expect(
      screen.getByText("“Today's video is sponsored by AcmeVPN.”"),
    ).toBeVisible();
    expect(screen.getByText("SOURCE CUE / 1")).toBeVisible();
  });

  it("renders a failed requirement without fabricating evidence", async () => {
    vi.stubGlobal("fetch", successfulFetch("fail"));
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement();

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByLabelText("Compliance status: Fail"),
    ).toBeVisible();
    expect(screen.queryByText("EVIDENCE")).not.toBeInTheDocument();
    expect(screen.queryByText("00:38")).not.toBeInTheDocument();
  });

  it("shows a safe malformed-transcript error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "INVALID_TRANSCRIPT",
            message: "The transcript could not be parsed.",
            details: { reason_code: "INVALID_TIMESTAMP" },
          },
        },
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement();

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByText(
        "The transcript could not be parsed. Check the SRT format and try again.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("INVALID_TIMESTAMP")).not.toBeInTheDocument();
  });

  it("reports a network failure without clearing the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection refused")),
    );
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement();

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByText("Could not connect to SponsorGuard API."),
    ).toBeVisible();
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(screen.getByLabelText("SRT transcript")).toHaveValue(VALID_SRT);
  });

  it("retries a network failure with all review input preserved", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce(async (_input, init) =>
        jsonResponse(responseForRequest(requestFromInit(init))),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement();
    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    await user.click(await screen.findByRole("button", { name: "Retry analysis" }));

    expect(
      await screen.findByRole("heading", {
        name: "AcmeVPN September Campaign",
      }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("SRT transcript")).toHaveValue(VALID_SRT);
  });

  it("prevents duplicate submissions while analysis is active", async () => {
    let completeRequest: (response: Response) => void = () => undefined;
    let submittedRequest: AnalyzeComplianceRequest | null = null;
    const pendingResponse = new Promise<Response>((resolve) => {
      completeRequest = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      submittedRequest = requestFromInit(init);
      return pendingResponse;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    await fillFirstRequirement();
    const button = screen.getByRole("button", { name: "Analyze review" });
    const form = button.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Analyzing review…" })).toBeDisabled();
    expect(submittedRequest).not.toBeNull();
    completeRequest(jsonResponse(responseForRequest(submittedRequest!)));
    await screen.findByText("Report complete");
  });

  it("provides semantic labels for controls and result statuses", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    render(<ReviewWorkspace />);
    expect(screen.getByLabelText("Campaign or review name")).toBeEnabled();
    expect(screen.getByLabelText("Requirement 1 type")).toBeEnabled();
    expect(screen.getByLabelText("Requirement 1 description")).toBeEnabled();
    expect(screen.getByLabelText("Requirement 1 target value")).toBeEnabled();
    expect(screen.getByLabelText("SRT transcript")).toBeEnabled();
    const user = await fillFirstRequirement();

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByLabelText("Compliance status: Pass"),
    ).toHaveTextContent("Pass");
  });
});
