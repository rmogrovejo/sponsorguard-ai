import type {
  ShortFormPlatform,
  ShortFormSuggestion,
  SuggestionFindingId,
  SuggestionOutcome,
  SuggestionPlacementStrategy,
  SpeechSegment,
  PreflightFinding,
} from "../types/shortform";
import { resolveApiBaseUrl } from "./apiBaseUrl";

const DEFAULT_TIMEOUT_MS = 65_000;

export class ShortFormSuggestionApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ShortFormSuggestionApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

interface GenerateOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GenerateShortFormSuggestionRequest {
  finding_id: SuggestionFindingId;
  platform: ShortFormPlatform;
  finding: PreflightFinding;
  speech_segments: SpeechSegment[];
  video_duration_seconds: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOutcome(value: unknown): value is SuggestionOutcome {
  return value === "suggested" || value === "review_manually";
}

function isFindingId(value: unknown): value is SuggestionFindingId {
  return value === "opening" || value === "cta";
}

function isStrategy(value: unknown): value is SuggestionPlacementStrategy {
  return (
    value === "replace_opening" ||
    value === "opening_first_seconds" ||
    value === "append_near_end"
  );
}

function isNullableNonnegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function parseSuggestion(value: unknown): ShortFormSuggestion {
  if (!isRecord(value)) throw malformedResponseError();
  const {
    finding_id: findingId,
    type,
    outcome,
    suggested_text: suggestedText,
    reason,
    referenced_segment_indices: indices,
    placement,
    display_label: displayLabel,
  } = value;
  if (
    !isFindingId(findingId) ||
    !isFindingId(type) ||
    findingId !== type ||
    !isOutcome(outcome) ||
    !(suggestedText === null || (typeof suggestedText === "string" && suggestedText.length > 0)) ||
    typeof reason !== "string" ||
    !reason ||
    !Array.isArray(indices) ||
    !indices.every((item) => Number.isInteger(item) && Number(item) >= 1) ||
    !isRecord(placement) ||
    !isStrategy(placement.strategy) ||
    !isNullableNonnegativeNumber(placement.start_seconds) ||
    !isNullableNonnegativeNumber(placement.end_seconds) ||
    !isNullableNonnegativeNumber(placement.after_seconds) ||
    typeof displayLabel !== "string" ||
    !displayLabel
  ) {
    throw malformedResponseError();
  }
  if (outcome === "suggested" && suggestedText === null) {
    throw malformedResponseError();
  }
  return {
    finding_id: findingId,
    type,
    outcome,
    suggested_text: suggestedText,
    reason,
    referenced_segment_indices: indices.map((item) => Number(item)),
    placement: {
      strategy: placement.strategy,
      start_seconds: placement.start_seconds,
      end_seconds: placement.end_seconds,
      after_seconds: placement.after_seconds,
    },
    display_label: displayLabel,
  };
}

function malformedResponseError(): ShortFormSuggestionApiError {
  return new ShortFormSuggestionApiError(
    "MALFORMED_API_RESPONSE",
    "CreatorPreflight returned an invalid suggestion. Try again.",
    true,
  );
}

function messageForCode(code: string): string {
  const messages: Record<string, string> = {
    SUGGESTION_NOT_ELIGIBLE: "This finding is not eligible for a suggestion.",
    INVALID_SUGGESTION_INPUT: "The finding no longer matches this preflight. Run preflight again.",
    LLM_PROVIDER_TIMEOUT: "Suggestion generation took too long. Try again.",
    LLM_PROVIDER_RATE_LIMITED: "Suggestion generation is temporarily busy. Try again shortly.",
    LLM_PROVIDER_AUTHENTICATION_ERROR: "Suggestion generation is not available right now.",
    LLM_PROVIDER_CONFIGURATION_ERROR: "Suggestion generation is not configured on this server.",
    LLM_PROVIDER_OUTPUT_INVALID: "CreatorPreflight could not validate the suggestion. Try again.",
    LLM_PROVIDER_UNAVAILABLE: "Suggestion generation is temporarily unavailable.",
  };
  return messages[code] ?? "CreatorPreflight could not generate this suggestion. Try again.";
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body.error) && typeof body.error.code === "string") {
      return body.error.code;
    }
  } catch {
    // Replace malformed backend content with safe copy.
  }
  return "SUGGESTION_FAILED";
}

export async function generateShortFormSuggestion(
  request: GenerateShortFormSuggestionRequest,
  options: GenerateOptions = {},
): Promise<ShortFormSuggestion> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/v1/shortform/suggestions/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ShortFormSuggestionApiError(
        "REQUEST_TIMEOUT",
        "Suggestion generation took too long. Try again.",
        true,
      );
    }
    throw new ShortFormSuggestionApiError(
      "NETWORK_ERROR",
      "Could not connect to CreatorPreflight API.",
      true,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ShortFormSuggestionApiError(code, messageForCode(code), response.status >= 429);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw malformedResponseError();
  }
  return parseSuggestion(payload);
}
