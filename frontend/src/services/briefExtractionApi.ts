import type {
  BriefExtractionMeta,
  ExtractBriefRequest,
  ExtractBriefResponse,
  ExtractedRequirement,
} from "../types/briefs";
import type { RequirementType } from "../types/compliance";
import { resolveApiBaseUrl } from "./apiBaseUrl";

const DEFAULT_TIMEOUT_MS = 25_000;

export type BriefExtractionApiErrorKind =
  | "backend"
  | "network"
  | "timeout"
  | "malformed_response";

export class BriefExtractionApiError extends Error {
  readonly kind: BriefExtractionApiErrorKind;
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    kind: BriefExtractionApiErrorKind,
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "BriefExtractionApiError";
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}

interface ExtractOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequirementType(value: unknown): value is RequirementType {
  return (
    value === "required_mention" ||
    value === "required_exact_token" ||
    value === "forbidden_phrase" ||
    value === "required_mention_before" ||
    value === "required_url" ||
    value === "required_talking_point" ||
    value === "forbidden_claim"
  );
}

function parseRequirement(value: unknown): ExtractedRequirement | null {
  if (!isRecord(value)) return null;

  const {
    id,
    type,
    description,
    value: targetValue,
    before_seconds: beforeSeconds,
    source_text: sourceText,
  } = value;
  const timingIsValid =
    type === "required_mention_before"
      ? typeof beforeSeconds === "number" &&
        Number.isFinite(beforeSeconds) &&
        beforeSeconds >= 0
      : beforeSeconds === null;

  if (
    typeof id !== "string" ||
    !id ||
    !isRequirementType(type) ||
    typeof description !== "string" ||
    !description.trim() ||
    typeof targetValue !== "string" ||
    !targetValue.trim() ||
    typeof sourceText !== "string" ||
    !sourceText.trim() ||
    !timingIsValid
  ) {
    return null;
  }

  return {
    id,
    type,
    description,
    value: targetValue,
    before_seconds:
      type === "required_mention_before" ? (beforeSeconds as number) : null,
    source_text: sourceText,
  };
}

function parseMeta(value: unknown): BriefExtractionMeta | null {
  if (!isRecord(value)) return null;
  const {
    provider,
    model,
    prompt_version: promptVersion,
    requirement_count: requirementCount,
  } = value;
  if (
    typeof provider !== "string" ||
    !provider ||
    typeof model !== "string" ||
    !model ||
    typeof promptVersion !== "string" ||
    !promptVersion ||
    !Number.isInteger(requirementCount) ||
    Number(requirementCount) < 0
  ) {
    return null;
  }
  return {
    provider,
    model,
    prompt_version: promptVersion,
    requirement_count: Number(requirementCount),
  };
}

function malformedResponseError(): BriefExtractionApiError {
  return new BriefExtractionApiError(
    "malformed_response",
    "MALFORMED_API_RESPONSE",
    "SponsorGuard returned an unexpected extraction result. Try again.",
    true,
  );
}

function parseResponse(value: unknown): ExtractBriefResponse {
  if (!isRecord(value) || !Array.isArray(value.requirements)) {
    throw malformedResponseError();
  }
  const requirements = value.requirements.map(parseRequirement);
  const meta = parseMeta(value.meta);
  if (
    !meta ||
    requirements.some((requirement) => requirement === null) ||
    meta.requirement_count !== requirements.length
  ) {
    throw malformedResponseError();
  }
  return {
    requirements: requirements.filter(
      (requirement): requirement is ExtractedRequirement => requirement !== null,
    ),
    meta,
  };
}

function userMessageForCode(code: string): string {
  const messages: Record<string, string> = {
    BRIEF_TOO_LARGE: "The sponsor brief is too large to process.",
    REQUEST_VALIDATION_ERROR:
      "The sponsor brief was not accepted. Check the document and try again.",
    LLM_PROVIDER_TIMEOUT:
      "Requirement extraction took too long. Your brief is still here—try again.",
    LLM_PROVIDER_UNAVAILABLE:
      "Requirement extraction is temporarily unavailable. You can keep adding rules manually.",
    LLM_PROVIDER_RATE_LIMITED:
      "Requirement extraction is busy right now. Wait briefly and try again.",
    LLM_PROVIDER_AUTHENTICATION_ERROR:
      "Requirement extraction is not available. You can keep adding rules manually.",
    LLM_PROVIDER_CONFIGURATION_ERROR:
      "Requirement extraction is not configured. You can keep adding rules manually.",
    LLM_PROVIDER_OUTPUT_INVALID:
      "The brief could not be converted into a reliable checklist. Try again or add rules manually.",
    INTERNAL_SERVER_ERROR:
      "SponsorGuard could not extract requirements. You can continue manually.",
  };
  return (
    messages[code] ??
    "SponsorGuard could not extract requirements. You can continue manually."
  );
}

function isRetryableCode(code: string, status: number): boolean {
  if (
    code === "LLM_PROVIDER_CONFIGURATION_ERROR" ||
    code === "LLM_PROVIDER_AUTHENTICATION_ERROR" ||
    code === "BRIEF_TOO_LARGE" ||
    code === "REQUEST_VALIDATION_ERROR"
  ) {
    return false;
  }
  return status >= 500 || code === "LLM_PROVIDER_RATE_LIMITED";
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
    // Deliberately replace malformed provider/API details with a safe message.
  }
  return response.status >= 500
    ? "INTERNAL_SERVER_ERROR"
    : "REQUEST_VALIDATION_ERROR";
}

export async function extractBriefRequirements(
  request: ExtractBriefRequest,
  options: ExtractOptions = {},
): Promise<ExtractBriefResponse> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      `${baseUrl}/api/v1/briefs/extract`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      },
    );
  } catch {
    if (controller.signal.aborted) {
      throw new BriefExtractionApiError(
        "timeout",
        "REQUEST_TIMEOUT",
        "Requirement extraction took too long. Your brief is still here—try again.",
        true,
      );
    }
    throw new BriefExtractionApiError(
      "network",
      "NETWORK_ERROR",
      "Could not connect to SponsorGuard API. You can keep adding rules manually.",
      true,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const code = await parseErrorCode(response);
    throw new BriefExtractionApiError(
      "backend",
      code,
      userMessageForCode(code),
      isRetryableCode(code, response.status),
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
