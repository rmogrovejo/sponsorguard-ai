import type {
  AnalyzeComplianceRequest,
  RequirementDraft,
  RequirementPayload,
} from "../../types/compliance";

export interface RequirementFieldErrors {
  description?: string;
  value?: string;
  beforeSeconds?: string;
}

export interface ReviewValidationErrors {
  campaignName?: string;
  requirements?: string;
  transcript?: string;
  requirementFields: Record<string, RequirementFieldErrors>;
}

export interface ReviewDraft {
  campaignName: string;
  requirements: RequirementDraft[];
  transcriptContent: string;
}

type ReviewValidationResult =
  | { valid: false; errors: ReviewValidationErrors }
  | {
      valid: true;
      errors: ReviewValidationErrors;
      request: AnalyzeComplianceRequest;
    };

function toPayload(requirement: RequirementDraft): RequirementPayload {
  const base = {
    id: requirement.id,
    description: requirement.description.trim(),
    value: requirement.value.trim(),
  };

  if (requirement.type === "required_mention_before") {
    return {
      ...base,
      type: requirement.type,
      before_seconds: Number(requirement.beforeSeconds),
    };
  }

  return { ...base, type: requirement.type };
}

export function validateReviewDraft(draft: ReviewDraft): ReviewValidationResult {
  const errors: ReviewValidationErrors = { requirementFields: {} };

  if (!draft.campaignName.trim()) {
    errors.campaignName = "Enter a campaign or review name.";
  }

  if (draft.requirements.length === 0) {
    errors.requirements = "Add at least one sponsorship requirement.";
  }

  for (const requirement of draft.requirements) {
    const fieldErrors: RequirementFieldErrors = {};

    if (!requirement.description.trim()) {
      fieldErrors.description = "Describe what should be checked.";
    }

    if (!requirement.value.trim()) {
      fieldErrors.value = "Enter the phrase or token to check.";
    }

    if (requirement.type === "required_mention_before") {
      const deadline = Number(requirement.beforeSeconds);
      if (
        !requirement.beforeSeconds.trim() ||
        !Number.isFinite(deadline) ||
        deadline < 0
      ) {
        fieldErrors.beforeSeconds = "Enter a deadline of zero seconds or more.";
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      errors.requirementFields[requirement.id] = fieldErrors;
    }
  }

  if (!draft.transcriptContent.trim().replace(/^\uFEFF/, "").trim()) {
    errors.transcript = "Paste or upload an SRT transcript before analyzing.";
  }

  const valid =
    !errors.campaignName &&
    !errors.requirements &&
    !errors.transcript &&
    Object.keys(errors.requirementFields).length === 0;

  if (!valid) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors,
    request: {
      requirements: draft.requirements.map(toPayload),
      transcript: {
        format: "srt",
        content: draft.transcriptContent,
      },
    },
  };
}
