import type { MessageKey, TranslateVars } from "../../i18n/translations";
import type { ComplianceResult, RequirementPayload } from "../../types/compliance";
import { formatTimestamp } from "../../utils/timestamp";
import {
  COMPLIANCE_REASON_PRIMARY_KEYS,
  isComplianceReasonCode,
  type ComplianceReasonCode,
} from "./reasonCodes";

export type TranslateFn = (key: MessageKey, vars?: TranslateVars) => string;

export interface LocalizedComplianceReason {
  lead: string;
}

type TimingRequirement = Extract<RequirementPayload, { type: "required_mention_before" }>;

function requirementValue(requirement?: RequirementPayload | null): string {
  return requirement?.value ?? "";
}

function deadlineSeconds(requirement?: RequirementPayload | null): number | null {
  if (!requirement || requirement.type !== "required_mention_before") return null;
  return (requirement as TimingRequirement).before_seconds;
}

function formatLateSeconds(seconds: number): string {
  return seconds.toFixed(3).replace(/\.?0+$/, "");
}

function timingCopy(
  code: Extract<
    ComplianceReasonCode,
    "REQUIRED_MENTION_WITHIN_DEADLINE" | "REQUIRED_MENTION_TOO_LATE"
  >,
  result: Pick<ComplianceResult, "timestamp_seconds">,
  requirement: RequirementPayload | null | undefined,
  t: TranslateFn,
): string {
  const value = requirementValue(requirement);
  const time =
    result.timestamp_seconds === null || result.timestamp_seconds === undefined
      ? null
      : formatTimestamp(result.timestamp_seconds);
  const deadline = deadlineSeconds(requirement);
  const deadlineLabel = deadline === null ? null : formatTimestamp(deadline);

  if (code === "REQUIRED_MENTION_WITHIN_DEADLINE") {
    if (time && deadlineLabel) {
      return t("sponsored.reasons.REQUIRED_MENTION_WITHIN_DEADLINE", {
        value,
        time,
        deadline: deadlineLabel,
      });
    }
    if (time) {
      return t("sponsored.reasons.REQUIRED_MENTION_WITHIN_DEADLINE_NO_DEADLINE", {
        value,
        time,
      });
    }
    return t("sponsored.reasons.REQUIRED_MENTION_WITHIN_DEADLINE_NO_TIME", { value });
  }

  if (time && deadline !== null) {
    const late = formatLateSeconds(result.timestamp_seconds! - deadline);
    const key =
      late === "1"
        ? "sponsored.reasons.REQUIRED_MENTION_TOO_LATE_ONE"
        : "sponsored.reasons.REQUIRED_MENTION_TOO_LATE";
    return t(key, { value, time, late });
  }
  if (time) {
    return t("sponsored.reasons.REQUIRED_MENTION_TOO_LATE_NO_DEADLINE", { value, time });
  }
  return t("sponsored.reasons.REQUIRED_MENTION_TOO_LATE_NO_TIME", { value });
}

export function localizeComplianceReason(
  result: Pick<ComplianceResult, "reason_code" | "timestamp_seconds">,
  requirement: RequirementPayload | null | undefined,
  t: TranslateFn,
): LocalizedComplianceReason {
  if (!isComplianceReasonCode(result.reason_code)) {
    return { lead: t("sponsored.reasons.unknown") };
  }

  if (
    result.reason_code === "REQUIRED_MENTION_WITHIN_DEADLINE" ||
    result.reason_code === "REQUIRED_MENTION_TOO_LATE"
  ) {
    return { lead: timingCopy(result.reason_code, result, requirement, t) };
  }

  const value = requirementValue(requirement);
  return {
    lead: t(COMPLIANCE_REASON_PRIMARY_KEYS[result.reason_code], { value }),
  };
}
