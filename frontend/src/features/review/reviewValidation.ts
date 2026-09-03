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

function isValidCampaignUrl(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || /\s/u.test(candidate)) return false;

  const hasExplicitScheme = candidate.includes("://");
  if (
    hasExplicitScheme &&
    !candidate.toLowerCase().startsWith("http://") &&
    !candidate.toLowerCase().startsWith("https://")
  ) {
    return false;
  }

  try {
    const parsed = new URL(
      hasExplicitScheme ? candidate : `https://${candidate}`,
    );
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname.includes(".") ||
      /^\[|\]$/u.test(parsed.hostname) ||
      /^\d+(?:\.\d+){3}$/u.test(parsed.hostname)
    ) {
      return false;
    }

    const labels = parsed.hostname.toLowerCase().split(".");
    return (
      labels.at(-1)!.length >= 2 &&
      labels.every((label) =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label),
      )
    );
  } catch {
    return false;
  }
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
      fieldErrors.value =
        requirement.type === "required_url"
          ? "Enter a campaign URL."
          : requirement.type === "required_talking_point"
            ? "Describe what viewers should understand."
            : requirement.type === "forbidden_claim"
              ? "Describe the meaning the creator must not communicate."
              : "Enter the phrase or token to check.";
    } else if (
      requirement.type === "required_url" &&
      !isValidCampaignUrl(requirement.value)
    ) {
      fieldErrors.value =
        "Enter a valid campaign URL such as acmevpn.com/creator.";
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
