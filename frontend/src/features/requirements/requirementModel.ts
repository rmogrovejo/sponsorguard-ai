import type { RequirementDraft, RequirementType } from "../../types/compliance";

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
    value: "forbidden_phrase",
    label: "Forbidden phrase",
    targetLabel: "Forbidden phrase",
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
