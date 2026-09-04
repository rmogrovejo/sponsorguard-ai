import type { RequirementType } from "../../types/compliance";
import type { MessageKey } from "../../i18n/translations";

export const REQUIREMENT_LABEL_KEYS: Record<RequirementType, MessageKey> = {
  required_mention: "requirement.required_mention",
  required_exact_token: "requirement.required_exact_token",
  required_url: "requirement.required_url",
  required_talking_point: "requirement.required_talking_point",
  forbidden_phrase: "requirement.forbidden_phrase",
  forbidden_claim: "requirement.forbidden_claim",
  required_mention_before: "requirement.required_mention_before",
};

export const REQUIREMENT_TARGET_KEYS: Record<RequirementType, MessageKey> = {
  required_mention: "requirement.target_required_mention",
  required_exact_token: "requirement.target_required_exact_token",
  required_url: "requirement.target_required_url",
  required_talking_point: "requirement.target_required_talking_point",
  forbidden_phrase: "requirement.target_forbidden_phrase",
  forbidden_claim: "requirement.target_forbidden_claim",
  required_mention_before: "requirement.target_required_mention_before",
};
