import type {
  FixAction,
  FixPlacementStrategy,
  GenerateFixRequest,
  GeneratedFix,
} from "../types/compliance";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_FIX_TIMEOUT_MS = 65_000;

export class FixGenerationApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "FixGenerationApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

interface GenerateOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAction(value: unknown): value is FixAction {
  return value === "insert" || value === "replace" || value === "review_manually";
}

function isStrategy(value: unknown): value is FixPlacementStrategy {
  return (
    value === "after_segment" ||
    value === "replace_segment" ||
    value === "before_deadline" ||
    value === "review_segment"
  );
}

function isNullableNonnegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function parseGeneratedFix(value: unknown): GeneratedFix {
  if (!isRecord(value)) throw malformedResponseError();
  const {
    requirement_id: requirementId,
    action,
    suggested_text: suggestedText,
    placement,
    reason,
  } = value;
  if (
    typeof requirementId !== "string" ||
    !requirementId ||
    !isAction(action) ||
    !(suggestedText === null || (typeof suggestedText === "string" && suggestedText.length > 0)) ||
    typeof reason !== "string" ||
    !reason
  ) {
    throw malformedResponseError();
  }

  let parsedPlacement: GeneratedFix["placement"] = null;
  if (placement !== null) {
    if (!isRecord(placement)) throw malformedResponseError();
    const {
      strategy,
      source_segment_index: sourceSegmentIndex,
      timestamp_seconds: timestampSeconds,
      before_seconds: beforeSeconds,
    } = placement;
    if (
      !isStrategy(strategy) ||
      !(sourceSegmentIndex === null || (Number.isInteger(sourceSegmentIndex) && Number(sourceSegmentIndex) >= 0)) ||
      !isNullableNonnegativeNumber(timestampSeconds) ||
      !isNullableNonnegativeNumber(beforeSeconds)
    ) {
      throw malformedResponseError();
    }
    parsedPlacement = {
      strategy,
      source_segment_index: sourceSegmentIndex === null ? null : Number(sourceSegmentIndex),
      timestamp_seconds: timestampSeconds,
      before_seconds: beforeSeconds,
    };
  }

  return {
    requirement_id: requirementId,
    action,
    suggested_text: suggestedText,
    placement: parsedPlacement,
    reason,
  };
}

function malformedResponseError(): FixGenerationApiError {
  return new FixGenerationApiError(
    "MALFORMED_API_RESPONSE",
    "SponsorGuard returned an invalid fix suggestion. Try again.",
    true,
  );
}

function messageForCode(code: string): string {
  const messages: Record<string, string> = {
    FIX_NOT_ELIGIBLE: "This finding is not eligible for a generated fix.",
    INVALID_FIX_INPUT: "The finding no longer matches this transcript. Run the review again.",
    INVALID_TRANSCRIPT: "The transcript could not be parsed. Run the review again.",
    LLM_PROVIDER_TIMEOUT: "Fix generation took too long. Try again.",
    LLM_PROVIDER_RATE_LIMITED: "Fix generation is temporarily busy. Try again shortly.",
    LLM_PROVIDER_AUTHENTICATION_ERROR: "Fix generation is not available right now.",
    LLM_PROVIDER_CONFIGURATION_ERROR: "Fix generation is not configured on this server.",
    LLM_PROVIDER_OUTPUT_INVALID: "SponsorGuard could not validate the suggested fix. Try again.",
    LLM_PROVIDER_UNAVAILABLE: "Fix generation is temporarily unavailable.",
  };
  return messages[code] ?? "SponsorGuard could not generate a fix. Try again.";
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body.error) && typeof body.error.code === "string") {
      return body.error.code;
    }
  } catch {
    // Deliberately replace malformed backend content with safe user-facing copy.
  }
  return "FIX_GENERATION_FAILED";
}

export async function generateFix(
  request: GenerateFixRequest,
  options: GenerateOptions = {},
): Promise<GeneratedFix> {
  const configuredUrl = import.meta.env.VITE_SPONSORGUARD_API_URL;
  const baseUrl = (options.baseUrl ?? configuredUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_FIX_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/v1/fixes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new FixGenerationApiError(
        "REQUEST_TIMEOUT",
        "Fix generation took too long. Try again.",
        true,
      );
    }
    throw new FixGenerationApiError(
      "NETWORK_ERROR",
      "Could not connect to SponsorGuard API.",
      true,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new FixGenerationApiError(code, messageForCode(code), response.status >= 429);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw malformedResponseError();
  }
  return parseGeneratedFix(body);
}
