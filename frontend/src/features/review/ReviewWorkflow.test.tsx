import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnalyzeComplianceRequest } from "../../types/compliance";
import {
  jsonResponse,
  responseForRequest,
  VALID_SRT,
} from "../../test/testData";
import { sampleDraft } from "../persistence/draftTestFixtures";
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

async function fillSemanticRequirement(
  type: "required_talking_point" | "forbidden_claim",
) {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Campaign or review name"),
    "Semantic campaign review",
  );
  await user.selectOptions(screen.getByLabelText("Requirement 1 type"), type);
  await user.type(
    screen.getByLabelText("Requirement 1 description"),
    type === "required_talking_point"
      ? "Explain the editing-time benefit"
      : "Avoid an absolute privacy claim",
  );
  await user.type(
    screen.getByLabelText("Requirement 1 target value"),
    type === "required_talking_point"
      ? "The product reduces editing time"
      : "The VPN makes users completely untraceable",
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
          evaluated: 2,
          not_evaluated: 0,
          passed: 1,
          warnings: 0,
          failed: 1,
          compliance_score: 50,
          verification_coverage: 100,
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
    expect(screen.getByText('Required mention "AcmeVPN" was found.')).toBeVisible();
    expect(screen.getByText('Required token "CREATOR25" was not found.')).toBeVisible();
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
    expect(
      screen.queryByRole("button", { name: /generate fix/i }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("button", { name: /generate fix/i }),
    ).toBeInTheDocument();
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
    expect(screen.getByLabelText("SRT transcript")).toHaveValue(VALID_SRT);
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(screen.getByText("REQUIRED FORMAT")).toBeVisible();
    expect(screen.getByText(/Hello, this is the first subtitle/)).toBeVisible();
    expect(screen.getByText("Each cue begins with an index.")).toBeVisible();
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
    await screen.findByText(/Report complete/);
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

  it("renders a semantic PASS with grounded evidence and verification metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = requestFromInit(init);
      return jsonResponse({
        summary: {
          total: 1,
          evaluated: 1,
          not_evaluated: 0,
          passed: 1,
          warnings: 0,
          failed: 0,
          compliance_score: 100,
          verification_coverage: 100,
        },
        results: [
          {
            requirement_id: request.requirements[0].id,
            status: "pass",
            reason_code: "SEMANTIC_REQUIREMENT_CONFIRMED",
            reason: "Semantic verification confirmed the required talking point.",
            source_segment_index: 1,
            timestamp_seconds: 38,
            evidence: "Today's video is sponsored by AcmeVPN.",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillSemanticRequirement("required_talking_point");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByLabelText("Compliance status: Pass"),
    ).toBeVisible();
    expect(screen.getByText("VERIFICATION / SEMANTIC")).toBeVisible();
    expect(screen.getByText("00:38")).toBeVisible();
    expect(
      screen.getByText("“Today's video is sponsored by AcmeVPN.”"),
    ).toBeVisible();
  });

  it("sends an accepted semantic requirement through the existing analysis payload", async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillSemanticRequirement("required_talking_point");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const request = requestFromInit(fetchMock.mock.calls[0][1]);
    expect(request.requirements[0]).toEqual({
      id: expect.stringMatching(/^req_[a-f0-9]{32}$/),
      type: "required_talking_point",
      description: "Explain the editing-time benefit",
      value: "The product reduces editing time",
    });
  });

  it("renders a semantic forbidden-claim FAIL without invented evidence", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = requestFromInit(init);
      return jsonResponse({
        summary: {
          total: 1,
          evaluated: 1,
          not_evaluated: 0,
          passed: 0,
          warnings: 0,
          failed: 1,
          compliance_score: 0,
          verification_coverage: 100,
        },
        results: [
          {
            requirement_id: request.requirements[0].id,
            status: "fail",
            reason_code: "FORBIDDEN_CLAIM_DETECTED",
            reason: "Semantic verification detected the prohibited claim.",
            source_segment_index: 1,
            timestamp_seconds: 38,
            evidence: "Today's video is sponsored by AcmeVPN.",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillSemanticRequirement("forbidden_claim");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByLabelText("Compliance status: Fail"),
    ).toBeVisible();
    expect(screen.getByText("A prohibited claim was detected.")).toBeVisible();
    expect(screen.getByText("VERIFICATION / SEMANTIC")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /generate fix/i }),
    ).toBeInTheDocument();
  });

  it("renders semantic content uncertainty as an accessible grounded WARNING", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = requestFromInit(init);
      return jsonResponse({
        summary: {
          total: 1,
          evaluated: 1,
          not_evaluated: 0,
          passed: 0,
          warnings: 1,
          failed: 0,
          compliance_score: 50,
          verification_coverage: 100,
        },
        results: [
          {
            requirement_id: request.requirements[0].id,
            status: "warning",
            reason_code: "SEMANTIC_REQUIREMENT_UNCERTAIN",
            reason:
              "The required talking point could not be confirmed with enough certainty.",
            source_segment_index: 1,
            timestamp_seconds: 38,
            evidence: "Today's video is sponsored by AcmeVPN.",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillSemanticRequirement("required_talking_point");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByLabelText("Compliance status: Review"),
    ).toBeVisible();
    expect(
      screen.getByText("The required meaning could not be confirmed with enough certainty."),
    ).toBeVisible();
    expect(
      screen.getByText("“Today's video is sponsored by AcmeVPN.”"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /generate fix/i }),
    ).toBeInTheDocument();
  });

  it("keeps deterministic findings visible when semantic verification is unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = requestFromInit(init);
      return jsonResponse({
        summary: {
          total: 2,
          evaluated: 1,
          not_evaluated: 1,
          passed: 1,
          warnings: 0,
          failed: 0,
          compliance_score: 100,
          verification_coverage: 50,
        },
        results: [
          {
            requirement_id: request.requirements[0].id,
            status: "not_evaluated",
            reason_code: "SEMANTIC_VERIFICATION_UNAVAILABLE",
            reason:
              "Semantic verification temporarily unavailable. Retry this verification before publishing.",
            source_segment_index: null,
            timestamp_seconds: null,
            evidence: null,
          },
          {
            requirement_id: request.requirements[1].id,
            status: "pass",
            reason_code: "REQUIRED_MENTION_FOUND",
            reason: "Required mention found.",
            source_segment_index: 1,
            timestamp_seconds: 38,
            evidence: "Today's video is sponsored by AcmeVPN.",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillSemanticRequirement("required_talking_point");
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    await user.type(
      screen.getByLabelText("Requirement 2 description"),
      "Mention AcmeVPN",
    );
    await user.type(
      screen.getByLabelText("Requirement 2 target value"),
      "AcmeVPN",
    );

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(
      await screen.findByLabelText("Compliance status: Not evaluated"),
    ).toBeVisible();
    expect(screen.getByLabelText("Compliance status: Pass")).toBeVisible();
    expect(
      screen.getByText("Semantic verification could not be completed."),
    ).toBeVisible();
    expect(screen.getByText("Mention AcmeVPN")).toBeVisible();
    expect(
      screen.getByLabelText(
        "Verification coverage 50 percent; 1 of 2 evaluated",
      ),
    ).toHaveTextContent("1 / 2");
    expect(screen.getByLabelText("Compliance score 100 out of 100")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /generate fix/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/review this requirement manually/i),
    ).toBeInTheDocument();
  });

  it("renders an unavailable score when no requirements were evaluated", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = requestFromInit(init);
      return jsonResponse({
        summary: {
          total: 1,
          evaluated: 0,
          not_evaluated: 1,
          passed: 0,
          warnings: 0,
          failed: 0,
          compliance_score: null,
          verification_coverage: 0,
        },
        results: [
          {
            requirement_id: request.requirements[0].id,
            status: "not_evaluated",
            reason_code: "SEMANTIC_VERIFICATION_UNAVAILABLE",
            reason:
              "Semantic verification temporarily unavailable. Retry this verification before publishing.",
            source_segment_index: null,
            timestamp_seconds: null,
            evidence: null,
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillSemanticRequirement("required_talking_point");

    await user.click(screen.getByRole("button", { name: "Analyze review" }));

    expect(await screen.findByLabelText("Compliance score unavailable")).toHaveTextContent(
      "—not scored",
    );
    expect(
      screen.getByLabelText("Verification coverage 0 percent; 0 of 1 evaluated"),
    ).toHaveTextContent("0 / 1");
    expect(
      screen.getByLabelText("Compliance status: Not evaluated"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /generate fix/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "Semantic campaign review",
    );
    expect(screen.getByLabelText("SRT transcript")).toHaveValue(VALID_SRT);
    expect(screen.getByRole("button", { name: "Analyze review" })).toBeEnabled();
  });

  it("generates, retries, regenerates, and dismisses one finding without changing another", async () => {
    let fixCalls = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/v1/compliance/analyze")) {
        const request = requestFromInit(init);
        return jsonResponse({
          summary: {
            total: 2,
            evaluated: 2,
            not_evaluated: 0,
            passed: 0,
            warnings: 0,
            failed: 2,
            compliance_score: 0,
            verification_coverage: 100,
          },
          results: [
            {
              requirement_id: request.requirements[0].id,
              status: "fail",
              reason_code: "REQUIRED_MENTION_MISSING",
              reason: "Required mention AcmeVPN was not found.",
              source_segment_index: null,
              timestamp_seconds: null,
              evidence: null,
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
      }

      const payload = JSON.parse(String(init?.body)) as {
        requirement: { id: string };
      };
      fixCalls += 1;
      if (fixCalls === 1) {
        return jsonResponse(
          {
            error: {
              code: "LLM_PROVIDER_TIMEOUT",
              message: "Internal timeout detail.",
            },
          },
          504,
        );
      }
      return jsonResponse({
        requirement_id: payload.requirement.id,
        action: "insert",
        suggested_text: "This content is sponsored by AcmeVPN.",
        placement: {
          strategy: "after_segment",
          source_segment_index: 2,
          timestamp_seconds: 52,
          before_seconds: null,
        },
        reason: "Insert the missing required sponsor mention.",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewWorkspace />);
    const user = await fillFirstRequirement();
    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    fireEvent.change(screen.getByLabelText("Requirement 2 description"), {
      target: { value: "Use code CREATOR25" },
    });
    fireEvent.change(screen.getByLabelText("Requirement 2 target value"), {
      target: { value: "CREATOR25" },
    });

    await user.click(screen.getByRole("button", { name: "Analyze review" }));
    const generateButtons = await screen.findAllByRole("button", {
      name: /generate fix/i,
    });
    expect(generateButtons).toHaveLength(2);

    await user.click(generateButtons[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Fix generation took too long. Try again.",
    );
    expect(
      screen.getByRole("button", { name: /generate fix for/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry fix/i }));
    expect(await screen.findByText("RECOMMENDED CHANGE")).toBeInTheDocument();
    expect(
      screen.getByText(/This content is sponsored by AcmeVPN\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/after 00:52/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate fix for/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /regenerate/i }));
    expect(await screen.findByText("RECOMMENDED CHANGE")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dismiss suggestion/i }));
    expect(screen.queryByText("RECOMMENDED CHANGE")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /generate fix/i })).toHaveLength(2);
  });

  it("restores authored requirements and transcript without analyzing", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const draft = sampleDraft();
    render(
      <ReviewWorkspace
        initialCampaignName={draft.sponsoredContent.campaignName}
        initialSponsorBrief={draft.sponsoredContent.sponsorBrief}
        initialRequirements={draft.sponsoredContent.requirements}
        initialTranscriptContent={draft.sponsoredContent.transcriptContent}
        initialTranscriptFileName={draft.sponsoredContent.transcriptFileName}
      />,
    );
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(screen.getByLabelText("Requirement 1 description")).toHaveValue("Mention AcmeVPN");
    expect(screen.getByLabelText("Requirement 2 target value")).toHaveValue("SAVE20");
    expect(screen.getByLabelText("SRT transcript")).toHaveValue(
      draft.sponsoredContent.transcriptContent,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
