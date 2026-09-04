export type ShortFormPlatform = "tiktok" | "youtube_shorts" | "instagram_reels";

export type PreflightStatus = "pass" | "warning" | "fail" | "not_evaluated";

export type PreflightCategory =
  | "media"
  | "format"
  | "audio"
  | "speech"
  | "opening"
  | "pacing"
  | "cta";

export interface TimeRange {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

export interface MediaInspection {
  filename: string;
  size_bytes: number;
  duration_seconds: number;
  width: number;
  height: number;
  aspect_ratio: number;
  orientation: "portrait" | "square" | "landscape";
  has_audio: boolean;
}

export interface PreflightFinding {
  check_id: string;
  category: PreflightCategory;
  status: PreflightStatus;
  title: string;
  reason: string;
  recommendation: string | null;
  evidence_text: string | null;
  ranges: TimeRange[];
  measurements: Record<string, number | string> | null;
}

export interface SpeechActivity {
  audio_start_seconds: number | null;
  activity_start_seconds: number | null;
  has_usable_signal: boolean;
  method: string;
  label: string;
}

export interface SpeechSegment {
  index: number;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface ReviewPriority {
  rank: number;
  title: string;
  check_id: string;
  timestamp_seconds: number | null;
}

export interface ShortFormReport {
  platform: ShortFormPlatform;
  media: MediaInspection;
  summary: {
    total: number;
    evaluated: number;
    not_evaluated: number;
    passed: number;
    warnings: number;
    failed: number;
    readiness_score: number | null;
    verification_coverage: number;
  };
  findings: PreflightFinding[];
  speech: SpeechActivity | null;
  speech_segments: SpeechSegment[];
  priorities: ReviewPriority[];
}

export interface LocalVideoSelection {
  file: File;
  filename: string;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export const PLATFORM_OPTIONS: ReadonlyArray<{
  value: ShortFormPlatform;
  label: string;
  detail: string;
}> = [
  { value: "tiktok", label: "TikTok", detail: "Vertical short-form" },
  { value: "youtube_shorts", label: "YouTube Shorts", detail: "Vertical short-form" },
  { value: "instagram_reels", label: "Instagram Reels", detail: "Vertical short-form" },
];

export const SHORTFORM_MAX_UPLOAD_BYTES = 25_000_000;
