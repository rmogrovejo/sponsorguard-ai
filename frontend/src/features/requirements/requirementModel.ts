import type { RequirementDraft, RequirementType } from "../../types/compliance";
import type { ExtractedRequirement } from "../../types/briefs";

export const REQUIREMENT_OPTIONS: ReadonlyArray<{
  value: RequirementType;
  label: string;
  targetLabel: string;
}> = [
  {
    value: "required_mention",
    label: "Required mention",
    targetLabel: "Required phrase",
  },
  {
    value: "required_exact_token",
    label: "Exact token or coupon",
    targetLabel: "Exact token",
  },
  {
    value: "required_url",
    label: "Required URL",
    targetLabel: "Campaign URL",
  },
  {
    value: "required_talking_point",
    label: "Required talking point",
    targetLabel: "What viewers should understand",
  },
  {
    value: "forbidden_phrase",
    label: "Forbidden phrase",
    targetLabel: "Forbidden phrase",
  },
  {
    value: "forbidden_claim",
    label: "Forbidden claim",
    targetLabel: "Meaning the creator must not communicate",
  },
  {
    value: "required_mention_before",
    label: "Must appear before",
    targetLabel: "Required phrase",
  },
];

export function createRequirementId(): string {
  const randomValues = new Uint32Array(4);
  globalThis.crypto.getRandomValues(randomValues);
  const suffix = Array.from(randomValues, (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("");

  return `req_${suffix}`;
}

export function createRequirementDraft(
  overrides: Partial<Omit<RequirementDraft, "id">> = {},
): RequirementDraft {
  return {
    id: createRequirementId(),
    type: "required_mention",
    description: "",
    value: "",
    beforeSeconds: "60",
    ...overrides,
  };
}

export function getTargetLabel(type: RequirementType): string {
  return (
    REQUIREMENT_OPTIONS.find((option) => option.value === type)?.targetLabel ??
    "Target value"
  );
}

export function getRequirementLabel(type: RequirementType): string {
  return (
    REQUIREMENT_OPTIONS.find((option) => option.value === type)?.label ??
    "Sponsorship requirement"
  );
}

export function isSemanticRequirementType(type: RequirementType): boolean {
  return type === "required_talking_point" || type === "forbidden_claim";
}

export function createExtractedRequirementDraft(
  requirement: ExtractedRequirement,
): RequirementDraft {
  return {
    id: requirement.id,
    type: requirement.type,
    description: requirement.description,
    value: requirement.value,
    beforeSeconds:
      requirement.type === "required_mention_before" &&
      requirement.before_seconds !== null
        ? String(requirement.before_seconds)
        : "",
    provenance: {
      kind: "sponsor_brief",
      sourceText: requirement.source_text,
    },
  };
}
