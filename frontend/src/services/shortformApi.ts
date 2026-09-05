import type { ShortFormPlatform, ShortFormReport } from "../types/shortform";
import { resolveApiBaseUrl } from "./apiBaseUrl";

const DEFAULT_TIMEOUT_MS = 90_000;

export class ShortFormApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ShortFormApiError";
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

function messageForCode(code: string): string {
  const messages: Record<string, string> = {
    MEDIA_TOO_LARGE: "This video is too large for a single preflight.",
    INVALID_MEDIA: "Upload an MP4 video before running preflight.",
    UNSUPPORTED_MEDIA: "The uploaded file is not a readable MP4 video.",
  };
  return messages[code] ?? "CreatorPreflight could not finish this preflight. Try again.";
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
  return "SHORTFORM_FAILED";
}

export async function analyzeShortForm(
  platform: ShortFormPlatform,
  file: File,
  options: AnalyzeOptions = {},
): Promise<ShortFormReport> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const body = new FormData();
  body.append("platform", platform);
  body.append("video", file, file.name);

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/v1/shortform/analyze`, {
      method: "POST",
      body,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ShortFormApiError(
        "REQUEST_TIMEOUT",
        "Preflight took too long. Try again.",
        true,
      );
    }
    throw new ShortFormApiError(
      "NETWORK_ERROR",
      "Could not connect to CreatorPreflight API.",
      true,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ShortFormApiError(code, messageForCode(code), response.status >= 429);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ShortFormApiError(
      "MALFORMED_API_RESPONSE",
      "CreatorPreflight returned an invalid preflight report.",
      true,
    );
  }
  return parseReport(payload);
}

function parseReport(value: unknown): ShortFormReport {
  if (!isRecord(value) || !isRecord(value.media) || !isRecord(value.summary) || !Array.isArray(value.findings)) {
    throw new ShortFormApiError(
      "MALFORMED_API_RESPONSE",
      "CreatorPreflight returned an invalid preflight report.",
      true,
    );
  }
  const report = value as unknown as ShortFormReport;
  return {
    ...report,
    findings: report.findings.map((item) => ({
      ...item,
      evidence_text: item.evidence_text ?? null,
    })),
    speech: report.speech ?? null,
    speech_segments: Array.isArray(report.speech_segments) ? report.speech_segments : [],
    priorities: Array.isArray(report.priorities) ? report.priorities : [],
  };
}
