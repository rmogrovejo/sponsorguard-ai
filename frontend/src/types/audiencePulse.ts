export const MAX_AUDIENCE_COMMENTS = 200;

export type AudiencePulseSource = "youtube" | "manual" | "session";

export type AudiencePulseInputMode = "youtube" | "manual";

export type ManualAudienceSource = "tiktok" | "instagram" | "stream" | "other";

export const MANUAL_AUDIENCE_SOURCES: ManualAudienceSource[] = [
  "tiktok",
  "instagram",
  "stream",
  "other",
];

export type AudienceAnalysisLanguage = "en" | "es";

export type AudienceAnalysisStatus = "complete" | "not_evaluated";

export type AudienceSignalCategory =
  | "positive"
  | "question"
  | "content_request"
  | "funny"
  | "constructive_criticism"
  | "negative"
  | "confusion"
  | "low_information";

export type ReplyWorthyKind = "question" | "request" | "criticism";

export interface AudienceComment {
  id: string;
  text: string;
  author: string | null;
}

export interface YouTubeVideoSnapshot {
  id: string;
  title: string;
  channel_title: string;
  comment_count_public: number | null;
}

export interface AudienceSignal {
  category: AudienceSignalCategory;
  count: number;
  percentage: number | null;
}

export interface AudienceTheme {
  rank: number;
  summary: string;
  comment_count: number;
  evidence_comment_ids: string[];
}

export interface ReplyWorthyComment {
  kind: ReplyWorthyKind;
  text: string;
  comment_id: string;
}

export interface ContentOpportunity {
  rank: number;
  title: string;
  grounded_in_count: number;
  evidence_comment_ids: string[];
}

export interface AudiencePulseReport {
  source: AudiencePulseSource;
  analysis_status: AudienceAnalysisStatus;
  analysis_error_code: string | null;
  comments_loaded: number;
  comments_classified: number;
  comments_actionable: number;
  comments: AudienceComment[];
  video: YouTubeVideoSnapshot | null;
  signals: AudienceSignal[];
  themes: AudienceTheme[];
  reply_worthy: ReplyWorthyComment[];
  opportunities: ContentOpportunity[];
}

export interface AudiencePulseAnalyzeRequest {
  youtube_url?: string;
  comments_text?: string;
  loaded_comments?: AudienceComment[];
  video?: YouTubeVideoSnapshot | null;
  analysis_language?: AudienceAnalysisLanguage;
}

export const SIGNAL_CATEGORY_ORDER: AudienceSignalCategory[] = [
  "positive",
  "question",
  "content_request",
  "funny",
  "constructive_criticism",
  "negative",
  "confusion",
  "low_information",
];
