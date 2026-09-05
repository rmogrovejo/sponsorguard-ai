import type {
  AudienceComment,
  AudiencePulseAnalyzeRequest,
  AudiencePulseReport,
  AudienceSignal,
  AudienceSignalCategory,
  AudienceTheme,
  ContentOpportunity,
  ReplyWorthyComment,
  ReplyWorthyKind,
  YouTubeVideoSnapshot,
} from "../types/audiencePulse";
import { SIGNAL_CATEGORY_ORDER } from "../types/audiencePulse";
import { resolveApiBaseUrl } from "./apiBaseUrl";

const DEFAULT_TIMEOUT_MS = 90_000;

export type AudiencePulseApiErrorKind =
  | "backend"
  | "network"
  | "timeout"
  | "malformed_response";

export class AudiencePulseApiError extends Error {
  readonly kind: AudiencePulseApiErrorKind;
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    kind: AudiencePulseApiErrorKind,
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "AudiencePulseApiError";
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

function isSignalCategory(value: unknown): value is AudienceSignalCategory {
  return (
    typeof value === "string" &&
    (SIGNAL_CATEGORY_ORDER as string[]).includes(value)
  );
}

function isReplyKind(value: unknown): value is ReplyWorthyKind {
  return value === "question" || value === "request" || value === "criticism";
}

function parseVideo(value: unknown): YouTubeVideoSnapshot | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.title !== "string" || !value.title) return null;
  if (typeof value.channel_title !== "string" || !value.channel_title) return null;
  if (
    !(
      value.comment_count_public === null ||
      (typeof value.comment_count_public === "number" &&
        Number.isFinite(value.comment_count_public) &&
        value.comment_count_public >= 0)
    )
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    channel_title: value.channel_title,
    comment_count_public: value.comment_count_public as number | null,
  };
}

function parseComment(value: unknown): AudienceComment | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.text !== "string" || !value.text.trim()) return null;
  if (!(value.author === null || value.author === undefined || typeof value.author === "string")) {
    return null;
  }
  return {
    id: value.id,
    text: value.text,
    author: typeof value.author === "string" ? value.author : null,
  };
}

function parseSignal(value: unknown): AudienceSignal | null {
  if (!isRecord(value)) return null;
  if (!isSignalCategory(value.category)) return null;
  if (typeof value.count !== "number" || !Number.isFinite(value.count) || value.count < 0) {
    return null;
  }
  if (value.percentage === null || value.percentage === undefined) {
    return { category: value.category, count: value.count, percentage: null };
  }
  if (
    typeof value.percentage !== "number" ||
    !Number.isFinite(value.percentage) ||
    value.percentage < 0 ||
    value.percentage > 100
  ) {
    return null;
  }
  return {
    category: value.category,
    count: value.count,
    percentage: value.percentage,
  };
}

function parseStringIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item) return null;
    ids.push(item);
  }
  return ids;
}

function parseTheme(value: unknown): AudienceTheme | null {
  if (!isRecord(value)) return null;
  const ids = parseStringIds(value.evidence_comment_ids);
  if (
    typeof value.rank !== "number" ||
    !Number.isFinite(value.rank) ||
    typeof value.summary !== "string" ||
    !value.summary.trim() ||
    typeof value.comment_count !== "number" ||
    !Number.isFinite(value.comment_count) ||
    ids === null ||
    ids.length === 0
  ) {
    return null;
  }
  return {
    rank: value.rank,
    summary: value.summary,
    comment_count: value.comment_count,
    evidence_comment_ids: ids,
  };
}

function parseReply(value: unknown): ReplyWorthyComment | null {
  if (!isRecord(value)) return null;
  if (!isReplyKind(value.kind)) return null;
  if (typeof value.text !== "string" || !value.text.trim()) return null;
  if (typeof value.comment_id !== "string" || !value.comment_id) return null;
  return {
    kind: value.kind,
    text: value.text,
    comment_id: value.comment_id,
  };
}

function parseOpportunity(value: unknown): ContentOpportunity | null {
  if (!isRecord(value)) return null;
  const ids = parseStringIds(value.evidence_comment_ids);
  if (
    typeof value.rank !== "number" ||
    !Number.isFinite(value.rank) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.grounded_in_count !== "number" ||
    !Number.isFinite(value.grounded_in_count) ||
    ids === null ||
    ids.length === 0
  ) {
    return null;
  }
  return {
    rank: value.rank,
    title: value.title,
    grounded_in_count: value.grounded_in_count,
    evidence_comment_ids: ids,
  };
}

function parseReport(value: unknown): AudiencePulseReport | null {
  if (!isRecord(value)) return null;
  if (value.source !== "youtube" && value.source !== "manual" && value.source !== "session") {
    return null;
  }
  if (value.analysis_status !== "complete" && value.analysis_status !== "not_evaluated") {
    return null;
  }
  if (
    !(
      value.analysis_error_code === null ||
      value.analysis_error_code === undefined ||
      typeof value.analysis_error_code === "string"
    )
  ) {
    return null;
  }
  for (const key of ["comments_loaded", "comments_classified", "comments_actionable"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0) {
      return null;
    }
  }
  if (!Array.isArray(value.comments)) return null;
  const comments: AudienceComment[] = [];
  for (const item of value.comments) {
    const comment = parseComment(item);
    if (!comment) return null;
    comments.push(comment);
  }

  const video = parseVideo(value.video ?? null);
  if (value.video !== null && value.video !== undefined && video === null) return null;
  if (!Array.isArray(value.signals) || !Array.isArray(value.themes)) return null;
  if (!Array.isArray(value.reply_worthy) || !Array.isArray(value.opportunities)) return null;

  if (value.analysis_status === "not_evaluated") {
    if (value.signals.length !== 0) return null;
    return {
      source: value.source,
      analysis_status: "not_evaluated",
      analysis_error_code:
        typeof value.analysis_error_code === "string" ? value.analysis_error_code : null,
      comments_loaded: value.comments_loaded as number,
      comments_classified: value.comments_classified as number,
      comments_actionable: value.comments_actionable as number,
      comments,
      video,
      signals: [],
      themes: [],
      reply_worthy: [],
      opportunities: [],
    };
  }

  const signals: AudienceSignal[] = [];
  for (const item of value.signals) {
    const signal = parseSignal(item);
    if (!signal) return null;
    signals.push(signal);
  }
  const themes: AudienceTheme[] = [];
  for (const item of value.themes) {
    const theme = parseTheme(item);
    if (!theme) return null;
    themes.push(theme);
  }
  const replyWorthy: ReplyWorthyComment[] = [];
  for (const item of value.reply_worthy) {
    const reply = parseReply(item);
    if (!reply) return null;
    replyWorthy.push(reply);
  }
  const opportunities: ContentOpportunity[] = [];
  for (const item of value.opportunities) {
    const opportunity = parseOpportunity(item);
    if (!opportunity) return null;
    opportunities.push(opportunity);
  }

  return {
    source: value.source,
    analysis_status: "complete",
    analysis_error_code: null,
    comments_loaded: value.comments_loaded as number,
    comments_classified: value.comments_classified as number,
    comments_actionable: value.comments_actionable as number,
    comments,
    video,
    signals,
    themes,
    reply_worthy: replyWorthy,
    opportunities,
  };
}

function messageForCode(code: string): string {
  const messages: Record<string, string> = {
    AUDIENCE_PULSE_INPUT_INVALID:
      "Provide either a YouTube URL or pasted comments, not both.",
    AUDIENCE_PULSE_NO_COMMENTS: "No comments were available to analyze.",
    YOUTUBE_NOT_CONFIGURED:
      "YouTube comment retrieval is not configured. Paste comments instead.",
    YOUTUBE_INVALID_URL: "Enter a valid YouTube or YouTube Shorts URL.",
    YOUTUBE_VIDEO_NOT_FOUND: "That YouTube video was not found or is not public.",
    YOUTUBE_COMMENTS_DISABLED: "Comments are disabled for this video.",
    YOUTUBE_QUOTA_EXCEEDED: "YouTube API quota was exceeded. Try again later.",
    YOUTUBE_UNAVAILABLE: "YouTube is temporarily unavailable.",
    RATE_LIMITED: "Too many requests. Wait a moment and try again.",
    LLM_PROVIDER_CONFIGURATION_ERROR:
      "Semantic audience analysis is not configured on this server.",
    LLM_PROVIDER_TIMEOUT: "Audience analysis took too long. Try again.",
    LLM_PROVIDER_RATE_LIMITED: "Audience analysis is temporarily busy. Try again shortly.",
    LLM_PROVIDER_UNAVAILABLE: "Audience analysis is temporarily unavailable.",
    LLM_PROVIDER_OUTPUT_INVALID: "Audience analysis returned an invalid result. Try again.",
    LLM_PROVIDER_AUTHENTICATION_ERROR:
      "Audience analysis is unavailable because provider authentication failed.",
    AUDIENCE_ANALYSIS_UNAVAILABLE: "Semantic audience analysis is temporarily unavailable.",
    REQUEST_TIMEOUT: "Audience Pulse analysis timed out. Try again.",
    NETWORK_ERROR: "Could not reach the API. Check that the backend is running.",
    MALFORMED_API_RESPONSE: "The API returned an unexpected Audience Pulse response.",
  };
  return messages[code] ?? "Audience Pulse could not be completed.";
}

function retryableForCode(code: string): boolean {
  return (
    code === "RATE_LIMITED" ||
    code === "LLM_PROVIDER_TIMEOUT" ||
    code === "LLM_PROVIDER_RATE_LIMITED" ||
    code === "LLM_PROVIDER_UNAVAILABLE" ||
    code === "LLM_PROVIDER_OUTPUT_INVALID" ||
    code === "LLM_PROVIDER_CONFIGURATION_ERROR" ||
    code === "AUDIENCE_ANALYSIS_UNAVAILABLE" ||
    code === "YOUTUBE_QUOTA_EXCEEDED" ||
    code === "YOUTUBE_UNAVAILABLE" ||
    code === "REQUEST_TIMEOUT" ||
    code === "NETWORK_ERROR" ||
    code === "MALFORMED_API_RESPONSE"
  );
}

export async function analyzeAudiencePulse(
  request: AudiencePulseAnalyzeRequest,
  options: AnalyzeOptions = {},
): Promise<AudiencePulseReport> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const body: Record<string, unknown> = {};
  if (request.loaded_comments) {
    body.loaded_comments = request.loaded_comments;
    if (request.video) body.video = request.video;
  } else if (request.youtube_url) {
    body.youtube_url = request.youtube_url;
  } else {
    body.comments_text = request.comments_text;
  }
  if (request.analysis_language) {
    body.analysis_language = request.analysis_language;
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/v1/audience-pulse/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    globalThis.clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AudiencePulseApiError(
        "timeout",
        "REQUEST_TIMEOUT",
        messageForCode("REQUEST_TIMEOUT"),
        true,
      );
    }
    throw new AudiencePulseApiError(
      "network",
      "NETWORK_ERROR",
      messageForCode("NETWORK_ERROR"),
      true,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code =
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.code === "string"
        ? payload.error.code
        : "INTERNAL_SERVER_ERROR";
    throw new AudiencePulseApiError(
      "backend",
      code,
      messageForCode(code),
      retryableForCode(code),
    );
  }

  const report = parseReport(payload);
  if (!report) {
    throw new AudiencePulseApiError(
      "malformed_response",
      "MALFORMED_API_RESPONSE",
      messageForCode("MALFORMED_API_RESPONSE"),
      true,
    );
  }
  return report;
}
