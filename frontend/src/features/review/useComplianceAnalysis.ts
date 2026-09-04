import { useCallback, useRef, useState } from "react";

import {
  analyzeCompliance,
  ComplianceApiError,
} from "../../services/complianceApi";
import type {
  AnalyzeComplianceResponse,
  RequestPhase,
  RequirementDraft,
  RequirementPayload,
  RequirementType,
} from "../../types/compliance";
import {
  validateReviewDraft,
  type ReviewDraft,
  type ReviewValidationErrors,
} from "./reviewValidation";

export interface ReviewReportSnapshot {
  campaignName: string;
  requirementDescriptions: Record<string, string>;
  requirementTypes: Record<string, RequirementType>;
  requirementsById: Record<string, RequirementPayload>;
  transcriptContent: string;
  response: AnalyzeComplianceResponse;
}

export interface ReviewRequestError {
  code: string;
  message: string;
  retryable: boolean;
}

const EMPTY_VALIDATION_ERRORS: ReviewValidationErrors = {
  requirementFields: {},
};

function snapshotDescriptions(
  requirements: RequirementDraft[],
): Record<string, string> {
  return Object.fromEntries(
    requirements.map((requirement) => [
      requirement.id,
      requirement.description.trim(),
    ]),
  );
}

function snapshotTypes(
  requirements: RequirementDraft[],
): Record<string, RequirementType> {
  return Object.fromEntries(
    requirements.map((requirement) => [requirement.id, requirement.type]),
  );
}

export function useComplianceAnalysis() {
  const [phase, setPhase] = useState<RequestPhase>("idle");
  const [validationErrors, setValidationErrors] =
    useState<ReviewValidationErrors>(EMPTY_VALIDATION_ERRORS);
  const [requestError, setRequestError] = useState<ReviewRequestError | null>(
    null,
  );
  const [report, setReport] = useState<ReviewReportSnapshot | null>(null);
  const inFlight = useRef(false);

  const analyze = useCallback(async (draft: ReviewDraft): Promise<void> => {
    if (inFlight.current) return;

    inFlight.current = true;
    setPhase("validating");
    setValidationErrors(EMPTY_VALIDATION_ERRORS);
    setRequestError(null);

    // Let the validating state reach assistive technology before network work starts.
    await Promise.resolve();
    const validation = validateReviewDraft(draft);

    if (!validation.valid) {
      setValidationErrors(validation.errors);
      setRequestError({
        code: "CLIENT_VALIDATION_ERROR",
        message: "Check the marked fields before analyzing this review.",
        retryable: false,
      });
      setPhase("error");
      inFlight.current = false;
      return;
    }

    setPhase("analyzing");

    try {
      const response = await analyzeCompliance(validation.request);
      setReport({
        campaignName: draft.campaignName.trim(),
        requirementDescriptions: snapshotDescriptions(draft.requirements),
        requirementTypes: snapshotTypes(draft.requirements),
        requirementsById: Object.fromEntries(
          validation.request.requirements.map((requirement) => [
            requirement.id,
            requirement,
          ]),
        ),
        transcriptContent: validation.request.transcript.content,
        response,
      });
      setPhase("success");
    } catch (error: unknown) {
      const safeError =
        error instanceof ComplianceApiError
          ? {
              code: error.code,
              message: error.message,
              retryable: error.retryable,
            }
          : {
              code: "UNEXPECTED_CLIENT_ERROR",
              message: "SponsorGuard could not complete the review. Try again.",
              retryable: true,
            };

      setRequestError(safeError);
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const markDirty = useCallback(() => {
    if (inFlight.current) return;
    setPhase("idle");
    setValidationErrors(EMPTY_VALIDATION_ERRORS);
    setRequestError(null);
    setReport(null);
  }, []);

  return {
    phase,
    validationErrors,
    requestError,
    report,
    analyze,
    markDirty,
  };
}
