import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ComplianceResult } from "../../types/compliance";
import type { FindingFixState } from "./useFixGeneration";
import { FixRecommendation } from "./FixRecommendation";

function failFinding(overrides: Partial<ComplianceResult> = {}): ComplianceResult {
  return {
    requirement_id: "req_coupon",
    status: "fail",
    reason_code: "REQUIRED_TOKEN_MISSING",
    reason: 'Required token "CREATOR25" was not found.',
    source_segment_index: null,
    timestamp_seconds: null,
    evidence: null,
    ...overrides,
  };
}

function warningFinding(): ComplianceResult {
  return {
    requirement_id: "req_talk",
    status: "warning",
    reason_code: "SEMANTIC_REQUIREMENT_UNCERTAIN",
    reason: "The talking point might be missing.",
    source_segment_index: 2,
    timestamp_seconds: 52.0,
    evidence: "You can save twenty-five percent using my link.",
  };
}

function passFinding(): ComplianceResult {
  return {
    requirement_id: "req_brand",
    status: "pass",
    reason_code: "REQUIRED_MENTION_FOUND",
    reason: "Required mention found.",
    source_segment_index: 1,
    timestamp_seconds: 38.0,
    evidence: "Today's video is sponsored by AcmeVPN.",
  };
}

function notEvaluatedFinding(): ComplianceResult {
  return {
    requirement_id: "req_sem",
    status: "not_evaluated",
    reason_code: "SEMANTIC_VERIFICATION_UNAVAILABLE",
    reason: "Semantic verification temporarily unavailable.",
    source_segment_index: null,
    timestamp_seconds: null,
    evidence: null,
  };
}

const IDLE_STATE: FindingFixState = {
  phase: "idle",
  suggestion: null,
  error: null,
};

const GENERATING_STATE: FindingFixState = {
  phase: "generating",
  suggestion: null,
  error: null,
};

const DETERMINISTIC_SUCCESS: FindingFixState = {
  phase: "success",
  suggestion: {
    requirement_id: "req_coupon",
    action: "insert",
    suggested_text: "Use code CREATOR25 at checkout.",
    placement: {
      strategy: "after_segment",
      source_segment_index: 2,
      timestamp_seconds: 52.0,
      before_seconds: null,
    },
    reason: "Insert the missing required promo code.",
  },
  error: null,
};

const SEMANTIC_SUCCESS: FindingFixState = {
  phase: "success",
  suggestion: {
    requirement_id: "req_claim",
    action: "replace",
    suggested_text: "This VPN helps protect your online privacy.",
    placement: {
      strategy: "replace_segment",
      source_segment_index: 3,
      timestamp_seconds: 65.0,
      before_seconds: null,
    },
    reason: "Use measured privacy language.",
  },
  error: null,
};

const DEADLINE_SUCCESS: FindingFixState = {
  phase: "success",
  suggestion: {
    requirement_id: "req_timing",
    action: "insert",
    suggested_text: "This content is sponsored by AcmeVPN.",
    placement: {
      strategy: "before_deadline",
      source_segment_index: 1,
      timestamp_seconds: 38.0,
      before_seconds: 30,
    },
    reason: "Move or repeat the existing sponsor mention before the deadline.",
  },
  error: null,
};

const RETRYABLE_ERROR: FindingFixState = {
  phase: "error",
  suggestion: null,
  error: { message: "Fix generation timed out.", retryable: true },
};

const NON_RETRYABLE_ERROR: FindingFixState = {
  phase: "error",
  suggestion: null,
  error: {
    message: "This finding is not eligible for a generated fix.",
    retryable: false,
  },
};

describe("FixRecommendation", () => {
  it("shows a generate-fix button for a FAIL finding in idle state", () => {
    const onGenerate = vi.fn();
    render(
      <FixRecommendation
        finding={failFinding()}
        state={IDLE_STATE}
        onGenerate={onGenerate}
        onDismiss={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: /generate fix for req_coupon/i,
    });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("shows a generate-fix button for an actionable WARNING", () => {
    render(
      <FixRecommendation
        finding={warningFinding()}
        state={IDLE_STATE}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /generate fix/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing for a PASS finding", () => {
    const { container } = render(
      <FixRecommendation
        finding={passFinding()}
        state={IDLE_STATE}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows a manual-review message for NOT_EVALUATED", () => {
    render(
      <FixRecommendation
        finding={notEvaluatedFinding()}
        state={IDLE_STATE}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/review this requirement manually/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate fix/i })).not.toBeInTheDocument();
  });

  it("renders a deterministic suggestion with placement", () => {
    render(
      <FixRecommendation
        finding={failFinding()}
        state={DETERMINISTIC_SUCCESS}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("RECOMMENDED CHANGE")).toBeInTheDocument();
    expect(screen.getByText("Insert")).toBeInTheDocument();
    expect(
      screen.getByText(/Use code CREATOR25 at checkout\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/after 00:52/i)).toBeInTheDocument();
    expect(screen.getByText(/insert the missing required promo code/i)).toBeInTheDocument();
  });

  it("renders a semantic suggestion with replace strategy", () => {
    render(
      <FixRecommendation
        finding={failFinding({ requirement_id: "req_claim" })}
        state={SEMANTIC_SUCCESS}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(
      screen.getByText(/This VPN helps protect your online privacy\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/replace wording at 01:05/i)).toBeInTheDocument();
  });

  it("renders before-deadline placement with both timestamps", () => {
    render(
      <FixRecommendation
        finding={failFinding({ requirement_id: "req_timing" })}
        state={DEADLINE_SUCCESS}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/before 00:30/i)).toBeInTheDocument();
    expect(screen.getByText(/current mention at 00:38/i)).toBeInTheDocument();
  });

  it("shows a generating state with disabled button", () => {
    render(
      <FixRecommendation
        finding={failFinding()}
        state={GENERATING_STATE}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /generate fix/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Generating fix…");
  });

  it("marks the container as aria-busy during generation", () => {
    render(
      <FixRecommendation
        finding={failFinding()}
        state={GENERATING_STATE}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const liveRegion = document.querySelector("[aria-busy='true'][aria-live='polite']");
    expect(liveRegion).toBeTruthy();
  });

  it("shows a retryable error with a retry button", () => {
    render(
      <FixRecommendation
        finding={failFinding()}
        state={RETRYABLE_ERROR}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Fix generation timed out.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows a non-retryable error without a retry button", () => {
    render(
      <FixRecommendation
        finding={failFinding()}
        state={NON_RETRYABLE_ERROR}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("calls onGenerate when the generate button is clicked", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <FixRecommendation
        finding={failFinding()}
        state={IDLE_STATE}
        onGenerate={onGenerate}
        onDismiss={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /generate fix/i }),
    );

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("calls onGenerate when the regenerate button is clicked", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <FixRecommendation
        finding={failFinding()}
        state={DETERMINISTIC_SUCCESS}
        onGenerate={onGenerate}
        onDismiss={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /regenerate/i }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <FixRecommendation
        finding={failFinding()}
        state={DETERMINISTIC_SUCCESS}
        onGenerate={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /dismiss suggestion/i }),
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("provides an accessible label on the suggestion section", () => {
    render(
      <FixRecommendation
        finding={failFinding()}
        state={DETERMINISTIC_SUCCESS}
        onGenerate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: /recommended change/i }),
    ).toBeInTheDocument();
  });
});
