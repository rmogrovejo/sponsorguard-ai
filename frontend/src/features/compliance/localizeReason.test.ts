import { describe, expect, it } from "vitest";

import { messages, translate } from "../../i18n/translations";
import type { ComplianceResult, RequirementPayload } from "../../types/compliance";
import { localizeComplianceReason } from "./localizeReason";
import {
  COMPLIANCE_REASON_CODES,
  COMPLIANCE_REASON_PRIMARY_KEYS,
  isComplianceReasonCode,
} from "./reasonCodes";

const tEn = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("en", key, vars);
const tEs = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("es", key, vars);

const SAMPLE_VALUES: Record<string, RequirementPayload> = {
  mention: {
    id: "req_mention",
    type: "required_mention",
    description: "Mention AcmeVPN",
    value: "AcmeVPN",
  },
  token: {
    id: "req_token",
    type: "required_exact_token",
    description: "Use code CREATOR25",
    value: "CREATOR25",
  },
  url: {
    id: "req_url",
    type: "required_url",
    description: "Share the campaign URL",
    value: "acmevpn.com/creator",
  },
  timing: {
    id: "req_timing",
    type: "required_mention_before",
    description: "Mention AcmeVPN before 01:00",
    value: "AcmeVPN",
    before_seconds: 60,
  },
  phrase: {
    id: "req_phrase",
    type: "forbidden_phrase",
    description: "Avoid guaranteed wording",
    value: "guaranteed untraceable",
  },
  talking: {
    id: "req_talk",
    type: "required_talking_point",
    description: "Explain the editing-time benefit",
    value: "The product reduces editing time",
  },
  claim: {
    id: "req_claim",
    type: "forbidden_claim",
    description: "Avoid an absolute privacy claim",
    value: "The VPN makes users completely untraceable",
  },
};

function requirementFor(code: string): RequirementPayload {
  if (code.includes("TOKEN")) return SAMPLE_VALUES.token;
  if (code.includes("URL")) return SAMPLE_VALUES.url;
  if (code.includes("PHRASE")) return SAMPLE_VALUES.phrase;
  if (code.includes("CLAIM")) return SAMPLE_VALUES.claim;
  if (code.includes("SEMANTIC") || code.includes("MANUAL")) return SAMPLE_VALUES.talking;
  if (code.includes("DEADLINE") || code.includes("TOO_LATE")) return SAMPLE_VALUES.timing;
  return SAMPLE_VALUES.mention;
}

function result(code: string, timestampSeconds: number | null = 78): Pick<
  ComplianceResult,
  "reason_code" | "timestamp_seconds" | "reason"
> {
  return {
    reason_code: code,
    reason: `English API reason for ${code}`,
    timestamp_seconds: timestampSeconds,
  };
}

describe("compliance reason-code catalog", () => {
  it("covers every known reason code with a translation key in both locales", () => {
    for (const code of COMPLIANCE_REASON_CODES) {
      expect(isComplianceReasonCode(code)).toBe(true);
      const key = COMPLIANCE_REASON_PRIMARY_KEYS[code];
      expect(key).toBe(`sponsored.reasons.${code}`);
      expect(translate("en", key, { value: "X", time: "01:18", deadline: "01:00", late: "18" })).not.toBe(
        key,
      );
      expect(translate("es", key, { value: "X", time: "01:18", deadline: "01:00", late: "18" })).not.toBe(
        key,
      );
      expect(messages.en.sponsored.reasons[code]).toBeTypeOf("string");
      expect(messages.es.sponsored.reasons[code]).toBeTypeOf("string");
    }
  });

  it("localizes every catalog code instead of using the English API reason", () => {
    for (const code of COMPLIANCE_REASON_CODES) {
      const finding = result(code);
      const requirement = requirementFor(code);
      const english = localizeComplianceReason(finding, requirement, tEn).lead;
      const spanish = localizeComplianceReason(finding, requirement, tEs).lead;
      expect(english).not.toBe(finding.reason);
      expect(spanish).not.toBe(finding.reason);
      expect(spanish).not.toBe(english);
      expect(english.length).toBeGreaterThan(0);
      expect(spanish.length).toBeGreaterThan(0);
    }
  });
});

describe("deterministic SponsorGuard copy", () => {
  it("interpolates mention, token, and URL values without translating them", () => {
    expect(
      localizeComplianceReason(result("REQUIRED_MENTION_FOUND"), SAMPLE_VALUES.mention, tEn).lead,
    ).toBe('Required mention "AcmeVPN" was found.');
    expect(
      localizeComplianceReason(result("REQUIRED_MENTION_MISSING"), SAMPLE_VALUES.mention, tEs).lead,
    ).toBe('No se encontró la mención requerida "AcmeVPN".');
    expect(
      localizeComplianceReason(result("REQUIRED_TOKEN_MISSING"), SAMPLE_VALUES.token, tEn).lead,
    ).toBe('Required token "CREATOR25" was not found.');
    expect(
      localizeComplianceReason(result("REQUIRED_TOKEN_FOUND"), SAMPLE_VALUES.token, tEs).lead,
    ).toBe('Se encontró el token requerido "CREATOR25".');
    expect(
      localizeComplianceReason(result("REQUIRED_URL_FOUND"), SAMPLE_VALUES.url, tEn).lead,
    ).toBe('Required URL "acmevpn.com/creator" was found.');
    expect(
      localizeComplianceReason(result("REQUIRED_URL_MISSING"), SAMPLE_VALUES.url, tEs).lead,
    ).toBe('No se encontró la URL requerida "acmevpn.com/creator".');
  });

  it("builds timing copy from structured timestamp and deadline values", () => {
    expect(
      localizeComplianceReason(
        result("REQUIRED_MENTION_TOO_LATE", 78),
        SAMPLE_VALUES.timing,
        tEn,
      ).lead,
    ).toBe('"AcmeVPN" was found at 01:18, 18 seconds after the required deadline.');
    expect(
      localizeComplianceReason(
        result("REQUIRED_MENTION_TOO_LATE", 78),
        SAMPLE_VALUES.timing,
        tEs,
      ).lead,
    ).toBe('"AcmeVPN" se encontró en 01:18, 18 segundos después del límite requerido.');
    expect(
      localizeComplianceReason(
        result("REQUIRED_MENTION_WITHIN_DEADLINE", 38),
        SAMPLE_VALUES.timing,
        tEn,
      ).lead,
    ).toBe('Required mention "AcmeVPN" was found at 00:38, within the 01:00 deadline.');
    expect(
      localizeComplianceReason(
        result("REQUIRED_MENTION_WITHIN_DEADLINE", 38),
        SAMPLE_VALUES.timing,
        tEs,
      ).lead,
    ).toBe('La mención requerida "AcmeVPN" se encontró en 00:38, dentro del plazo de 01:00.');
  });

  it("uses a one-second timing variant without parsing English reason text", () => {
    expect(
      localizeComplianceReason(
        result("REQUIRED_MENTION_TOO_LATE", 61),
        SAMPLE_VALUES.timing,
        tEn,
      ).lead,
    ).toBe('"AcmeVPN" was found at 01:01, 1 second after the required deadline.');
  });
});

describe("semantic SponsorGuard copy", () => {
  it("localizes talking-point and forbidden-claim codes in both languages", () => {
    expect(
      localizeComplianceReason(result("SEMANTIC_REQUIREMENT_CONFIRMED"), SAMPLE_VALUES.talking, tEn)
        .lead,
    ).toBe("The required meaning was communicated.");
    expect(
      localizeComplianceReason(result("SEMANTIC_REQUIREMENT_MISSING"), SAMPLE_VALUES.talking, tEs)
        .lead,
    ).toBe("No se detectó el mensaje requerido.");
    expect(
      localizeComplianceReason(result("FORBIDDEN_CLAIM_DETECTED"), SAMPLE_VALUES.claim, tEn).lead,
    ).toBe("A prohibited claim was detected.");
    expect(
      localizeComplianceReason(result("FORBIDDEN_CLAIM_DETECTED"), SAMPLE_VALUES.claim, tEs).lead,
    ).toBe("Se detectó una afirmación prohibida.");
    expect(
      localizeComplianceReason(result("SEMANTIC_VERIFICATION_UNAVAILABLE"), SAMPLE_VALUES.talking, tEs)
        .lead,
    ).toBe("No se pudo completar la verificación semántica.");
  });

  it("uses a localized fallback for unknown future reason codes", () => {
    const finding = result("FUTURE_REASON_CODE");
    expect(localizeComplianceReason(finding, SAMPLE_VALUES.mention, tEn).lead).toBe(
      "This finding could not be explained automatically.",
    );
    expect(localizeComplianceReason(finding, SAMPLE_VALUES.mention, tEs).lead).toBe(
      "No se pudo explicar este hallazgo de forma automática.",
    );
    expect(localizeComplianceReason(finding, SAMPLE_VALUES.mention, tEn).lead).not.toBe(
      finding.reason,
    );
  });
});
