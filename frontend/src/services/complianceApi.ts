import type {
  AnalyzeComplianceRequest,
  AnalyzeComplianceResponse,
  ComplianceResult,
  ComplianceStatus,
  ComplianceSummary,
} from "../types/compliance";

import { resolveApiBaseUrl } from "./apiBaseUrl";

const DEFAULT_TIMEOUT_MS = 75_000;

export type ComplianceApiErrorKind =
  | "backend"
  | "network"
  | "timeout"
  | "malformed_response";

export class ComplianceApiError extends Error {
  readonly kind: ComplianceApiErrorKind;
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    kind: ComplianceApiErrorKind,
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "ComplianceApiError";
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}

interface AnalyzeOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSummary(value: unknown): ComplianceSummary | null {
  if (!isRecord(value)) return null;

  const {
    total,
    evaluated,
    not_evaluated: notEvaluated,
    passed,
    warnings,
    failed,
    compliance_score: score,
    verification_coverage: verificationCoverage,
  } = value;
  if (
    ![total, evaluated, notEvaluated, passed, warnings, failed].every(
      (item) => Number.isInteger(item) && Number(item) >= 0,
    ) ||
    Number(total) < 1 ||
    Number(evaluated) + Number(notEvaluated) !== Number(total) ||
    Number(evaluated) !== Number(passed) + Number(warnings) + Number(failed) ||
    !(
      (Number(evaluated) === 0 && score === null) ||
      (Number(evaluated) > 0 &&
        isFiniteNumber(score) &&
        score >= 0 &&
        score <= 100)
    ) ||
    !isFiniteNumber(verificationCoverage) ||
    verificationCoverage < 0 ||
    verificationCoverage > 100
  ) {
    return null;
  }

  return {
    total: Number(total),
    evaluated: Number(evaluated),
    not_evaluated: Number(notEvaluated),
    passed: Number(passed),
    warnings: Number(warnings),
    failed: Number(failed),
    compliance_score: score,
    verification_coverage: verificationCoverage,
  };
}

function isStatus(value: unknown): value is ComplianceStatus {
  return (
    value === "pass" ||
    value === "warning" ||
    value === "fail" ||
    value === "not_evaluated"
  );
}

function parseResult(value: unknown): ComplianceResult | null {
  if (!isRecord(value)) return null;

  const {
    requirement_id: requirementId,
    status,
    reason_code: reasonCode,
    reason,
    source_segment_index: sourceSegmentIndex,
    timestamp_seconds: timestampSeconds,
    evidence,
  } = value;

  if (
    typeof requirementId !== "string" ||
    !requirementId ||
    !isStatus(status) ||
    typeof reasonCode !== "string" ||
    !reasonCode ||
    typeof reason !== "string" ||
    !reason ||
    !(
      sourceSegmentIndex === null ||
      (Number.isInteger(sourceSegmentIndex) && Number(sourceSegmentIndex) >= 0)
    ) ||
    !(
      timestampSeconds === null ||
      (isFiniteNumber(timestampSeconds) && timestampSeconds >= 0)
    ) ||
    !(evidence === null || typeof evidence === "string")
  ) {
    return null;
  }

  return {
    requirement_id: requirementId,
    status,
    reason_code: reasonCode,
    reason,
    source_segment_index:
      sourceSegmentIndex === null ? null : Number(sourceSegmentIndex),
    timestamp_seconds: timestampSeconds,
    evidence,
  };
}

function parseResponse(value: unknown): AnalyzeComplianceResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw malformedResponseError();
  }

  const summary = parseSummary(value.summary);
  const results = value.results.map(parseResult);

  if (
    !summary ||
    results.some((result) => result === null) ||
    summary.total !== results.length
  ) {
    throw malformedResponseError();
  }

  return {
    summary,
    results: results.filter((result): result is ComplianceResult => result !== null),
  };
}

function malformedResponseError(): ComplianceApiError {
  return new ComplianceApiError(
    "malformed_response",
    "MALFORMED_API_RESPONSE",
    "SponsorGuard returned an unexpected response. Try again.",
    true,
  );
}

function userMessageForCode(code: string): string {
  const messages: Record<string, string> = {
    INVALID_TRANSCRIPT:
      "The transcript could not be parsed. Check the SRT format and try again.",
    TRANSCRIPT_TOO_LARGE: "The transcript is too large for this review.",
    REQUEST_VALIDATION_ERROR:
      "Some review details were not accepted. Check the form and try again.",
    INVALID_COMPLIANCE_INPUT:
      "The review requirements could not be analyzed. Check the form and try again.",
    UNSUPPORTED_TRANSCRIPT_FORMAT:
      "This transcript format is not supported. Upload or paste an SRT file.",
    INTERNAL_SERVER_ERROR:
      "SponsorGuard could not complete the review. Please try again.",
  };

  return messages[code] ?? "SponsorGuard could not complete the review. Please try again.";
}

async function parseErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.code === "string"
    ) {
      return body.error.code;
    }
  } catch {
    // The public message below deliberately does not expose malformed bodies.
  }

  return response.status >= 500
    ? "INTERNAL_SERVER_ERROR"
    : "REQUEST_VALIDATION_ERROR";
}

export async function analyzeCompliance(
  request: AnalyzeComplianceRequest,
  options: AnalyzeOptions = {},
): Promise<AnalyzeComplianceResponse> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/v1/compliance/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ComplianceApiError(
        "timeout",
        "REQUEST_TIMEOUT",
        "SponsorGuard took too long to respond. Try the review again.",
        true,
      );
    }

    throw new ComplianceApiError(
      "network",
      "NETWORK_ERROR",
      "Could not connect to SponsorGuard API.",
      true,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const code = await parseErrorCode(response);
    throw new ComplianceApiError(
      "backend",
      code,
      userMessageForCode(code),
      response.status >= 500,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw malformedResponseError();
  }

  return parseResponse(body);
}
