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

/** Presentation-only platform guidance. Mirrors backend preferred windows; not used for scoring. */
export const PLATFORM_PRESENTATION: Record<
  ShortFormPlatform,
  {
    preferredMinWidth: number;
    preferredMinHeight: number;
    minDurationSeconds: number;
    preferredMaxDurationSeconds: number;
    maxDurationSeconds: number;
  }
> = {
  tiktok: {
    preferredMinWidth: 1080,
    preferredMinHeight: 1920,
    minDurationSeconds: 3,
    preferredMaxDurationSeconds: 60,
    maxDurationSeconds: 180,
  },
  youtube_shorts: {
    preferredMinWidth: 1080,
    preferredMinHeight: 1920,
    minDurationSeconds: 3,
    preferredMaxDurationSeconds: 60,
    maxDurationSeconds: 60,
  },
  instagram_reels: {
    preferredMinWidth: 1080,
    preferredMinHeight: 1920,
    minDurationSeconds: 3,
    preferredMaxDurationSeconds: 90,
    maxDurationSeconds: 180,
  },
};

export const SHORTFORM_MAX_UPLOAD_BYTES = 25_000_000;

export type SuggestionFindingId = "opening" | "cta";

export type SuggestionOutcome = "suggested" | "review_manually";

export type SuggestionPlacementStrategy =
  | "replace_opening"
  | "opening_first_seconds"
  | "append_near_end";

export interface ShortFormSuggestionPlacement {
  strategy: SuggestionPlacementStrategy;
  start_seconds: number | null;
  end_seconds: number | null;
  after_seconds: number | null;
}

export interface ShortFormSuggestion {
  finding_id: SuggestionFindingId;
  type: SuggestionFindingId;
  outcome: SuggestionOutcome;
  suggested_text: string | null;
  reason: string;
  referenced_segment_indices: number[];
  placement: ShortFormSuggestionPlacement;
  display_label: string;
}

export function isSuggestionEligible(finding: PreflightFinding): boolean {
  return (finding.check_id === "opening" || finding.check_id === "cta") && finding.status === "warning";
}
