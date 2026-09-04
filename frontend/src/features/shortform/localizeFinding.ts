import type { MessageKey, TranslateVars } from "../../i18n/translations";
import type {
  PreflightFinding,
  ReviewPriority,
  ShortFormPlatform,
} from "../../types/shortform";
import { PLATFORM_PRESENTATION } from "../../types/shortform";
import { formatTimestampPrecise } from "../../utils/timestamp";

export type TranslateFn = (key: MessageKey, vars?: TranslateVars) => string;

export interface FindingCopy {
  lead: string;
  recommendation: string | null;
  providerDetail?: string | null;
}

export interface FindingCopyContext {
  platform: ShortFormPlatform;
  hasAudio: boolean;
}

const PLATFORM_LABEL = {
  tiktok: "shortform.tiktok",
  youtube_shorts: "shortform.youtube_shorts",
  instagram_reels: "shortform.instagram_reels",
} as const satisfies Record<ShortFormPlatform, MessageKey>;

const PRIORITY_KEYS = {
  opening: "shortform.priorityOpening",
  dead_air: "shortform.priorityPacing",
  cta: "shortform.priorityCta",
  orientation: "shortform.priorityOrientation",
  duration: "shortform.priorityDuration",
  resolution: "shortform.priorityResolution",
  audio_track: "shortform.priorityAudio",
  speech_activity: "shortform.prioritySpeech",
} as const satisfies Record<string, MessageKey>;

export function localizePriority(item: ReviewPriority, t: TranslateFn): string {
  if (item.check_id === "dead_air" && item.timestamp_seconds !== null) {
    return t("shortform.priorityPacingAt", {
      time: formatTimestampPrecise(item.timestamp_seconds),
    });
  }
  const key = Object.hasOwn(PRIORITY_KEYS, item.check_id)
    ? PRIORITY_KEYS[item.check_id as keyof typeof PRIORITY_KEYS]
    : null;
  return key ? t(key) : item.title;
}

export function localizeFindingCopy(
  finding: PreflightFinding,
  context: FindingCopyContext,
  t: TranslateFn,
): FindingCopy {
  switch (finding.check_id) {
    case "orientation":
      return orientationCopy(finding, context.platform, t);
    case "resolution":
      return resolutionCopy(finding, context.platform, t);
    case "duration":
      return durationCopy(finding, context.platform, t);
    case "audio_track":
      return audioCopy(finding, t);
    case "speech_activity":
      return speechCopy(finding, context.hasAudio, t);
    case "dead_air":
      return pacingCopy(finding, context.hasAudio, t);
    case "opening":
      return openingCopy(finding, t);
    case "cta":
      return ctaCopy(finding, t);
    default:
      return fallbackCopy(finding, t);
  }
}

function orientationCopy(
  finding: PreflightFinding,
  platform: ShortFormPlatform,
  t: TranslateFn,
): FindingCopy {
  if (finding.status === "pass") {
    return { lead: t("shortform.portrait"), recommendation: null };
  }
  const size = pixelSize(finding);
  const platformLabel = t(PLATFORM_LABEL[platform]);
  const orientation = stringMeasure(finding, "orientation");
  if (finding.status === "fail" || orientation === "landscape") {
    return {
      lead: t("shortform.findings.orientationLandscape", {
        size: size ?? pixelFallback(finding),
        platform: platformLabel,
      }),
      recommendation: t("shortform.findings.orientationExport"),
    };
  }
  return {
    lead: t("shortform.findings.orientationOutside", {
      orientation: orientationLabel(orientation, t),
      size: size ?? pixelFallback(finding),
    }),
    recommendation: t("shortform.findings.orientationReviewCrop"),
  };
}

function resolutionCopy(
  finding: PreflightFinding,
  platform: ShortFormPlatform,
  t: TranslateFn,
): FindingCopy {
  if (finding.status === "pass") {
    return { lead: t("shortform.findings.resolutionHd"), recommendation: null };
  }
  const profile = PLATFORM_PRESENTATION[platform];
  return {
    lead: t("shortform.findings.resolutionBelow"),
    recommendation: t("shortform.findings.resolutionPrefer", {
      width: profile.preferredMinWidth,
      height: profile.preferredMinHeight,
      platform: t(PLATFORM_LABEL[platform]),
    }),
  };
}

function durationCopy(
  finding: PreflightFinding,
  platform: ShortFormPlatform,
  t: TranslateFn,
): FindingCopy {
  const profile = PLATFORM_PRESENTATION[platform];
  const duration = numberMeasure(finding, "duration_seconds");
  const value = duration !== null ? duration.toFixed(2) : "";
  const platformLabel = t(PLATFORM_LABEL[platform]);
  if (finding.status === "pass") {
    return {
      lead: t("shortform.findings.durationWithin", { value, platform: platformLabel }),
      recommendation: null,
    };
  }
  if (finding.status === "warning") {
    return {
      lead: t("shortform.findings.durationPreferredLong", {
        value,
        preferred: profile.preferredMaxDurationSeconds.toFixed(0),
        platform: platformLabel,
      }),
      recommendation: t("shortform.findings.durationTighter"),
    };
  }
  if (duration !== null && duration < profile.minDurationSeconds) {
    return {
      lead: t("shortform.findings.durationTooShort", {
        value,
        minimum: profile.minDurationSeconds.toFixed(0),
      }),
      recommendation: t("shortform.findings.durationExtend"),
    };
  }
  return {
    lead: t("shortform.findings.durationTooLong", {
      value,
      maximum: profile.maxDurationSeconds.toFixed(0),
      platform: platformLabel,
    }),
    recommendation: t("shortform.findings.durationTrim"),
  };
}

function audioCopy(finding: PreflightFinding, t: TranslateFn): FindingCopy {
  if (finding.status === "pass") {
    return { lead: t("shortform.findings.audioDetected"), recommendation: null };
  }
  return {
    lead: t("shortform.findings.audioMissing"),
    recommendation: t("shortform.findings.audioAdd"),
  };
}

function speechCopy(
  finding: PreflightFinding,
  hasAudio: boolean,
  t: TranslateFn,
): FindingCopy {
  if (finding.status === "not_evaluated") {
    return {
      lead: unevaluatedMediaLead(finding.reason, hasAudio, "speech", t),
      recommendation: null,
    };
  }
  if (finding.status === "pass") {
    return { lead: t("shortform.speechPassLead"), recommendation: null };
  }
  if (numberMeasure(finding, "audio_start_seconds") !== null || mentions(finding.reason, "audio energy was detected")) {
    return { lead: t("shortform.findings.speechEnergyOnly"), recommendation: null };
  }
  return { lead: t("shortform.findings.speechNoSignal"), recommendation: null };
}

function pacingCopy(
  finding: PreflightFinding,
  hasAudio: boolean,
  t: TranslateFn,
): FindingCopy {
  if (finding.status === "not_evaluated") {
    return {
      lead: unevaluatedMediaLead(finding.reason, hasAudio, "pacing", t),
      recommendation: null,
    };
  }
  if (finding.status === "pass") {
    return { lead: t("shortform.findings.pacingClear"), recommendation: null };
  }
  const count =
    numberMeasure(finding, "interval_count") ??
    (finding.ranges.length > 0 ? finding.ranges.length : 1);
  const first =
    finding.ranges[0]?.duration_seconds ?? numberMeasure(finding, "longest_seconds") ?? 0;
  const value = first.toFixed(2);
  const lead =
    count > 1
      ? t("shortform.findings.pacingSummaryMany", { value, count })
      : t("shortform.findings.pacingSummaryOne", { value });
  return {
    lead,
    recommendation: t("shortform.findings.pacingReview"),
  };
}

function openingCopy(finding: PreflightFinding, t: TranslateFn): FindingCopy {
  if (finding.status === "not_evaluated") {
    return { lead: unevaluatedLead(finding.reason, t), recommendation: null };
  }
  const time = openingTime(finding);
  const decision = stringMeasure(finding, "hook_decision");
  if (finding.status === "pass" || decision === "strong") {
    return {
      lead: time
        ? t("shortform.findings.openingClear", { time })
        : t("shortform.findings.openingClearUnknown"),
      recommendation: null,
    };
  }
  if (decision === "weak" || mentions(finding.reason, "does not present a clear subject")) {
    return {
      lead: t("shortform.findings.openingWeak"),
      recommendation: t("shortform.findings.openingEarlier"),
      providerDetail: unknownProviderReason(finding.reason, KNOWN_OPENING_REASONS),
    };
  }
  return {
    lead: t("shortform.findings.openingReview"),
    recommendation: t("shortform.findings.openingEarlier"),
    providerDetail: unknownProviderReason(finding.reason, KNOWN_OPENING_REASONS),
  };
}

function ctaCopy(finding: PreflightFinding, t: TranslateFn): FindingCopy {
  if (finding.status === "not_evaluated") {
    return { lead: unevaluatedLead(finding.reason, t), recommendation: null };
  }
  const decision = stringMeasure(finding, "cta_decision");
  const time = ctaTime(finding);
  if (finding.status === "pass" || decision === "found") {
    return {
      lead: time
        ? t("shortform.findings.ctaDetected", { time })
        : t("shortform.findings.ctaDetectedUnknown"),
      recommendation: null,
    };
  }
  if (decision === "not_found" || mentions(finding.reason, "no clear call to action")) {
    return {
      lead: t("shortform.findings.ctaMissing"),
      recommendation: t("shortform.findings.ctaNextStep"),
      providerDetail: unknownProviderReason(finding.reason, KNOWN_CTA_REASONS),
    };
  }
  if (decision === "review") {
    return {
      lead: t("shortform.findings.ctaReview"),
      recommendation: t("shortform.findings.ctaNextStep"),
      providerDetail: unknownProviderReason(finding.reason, KNOWN_CTA_REASONS),
    };
  }
  return {
    lead: t("shortform.findings.ctaMissing"),
    recommendation: localizeKnownRecommendation(finding.recommendation, t),
    providerDetail: unknownProviderReason(finding.reason, KNOWN_CTA_REASONS),
  };
}

function unevaluatedMediaLead(
  reason: string,
  hasAudio: boolean,
  kind: "speech" | "pacing",
  t: TranslateFn,
): string {
  if (mentions(reason, "no audio track is present") || (!hasAudio && !mentions(reason, "decoding failed"))) {
    return t(kind === "speech" ? "shortform.findings.speechNoAudio" : "shortform.findings.pacingNoAudio");
  }
  return t(kind === "speech" ? "shortform.findings.speechDecodeFailed" : "shortform.findings.pacingDecodeFailed");
}

function unevaluatedLead(reason: string, t: TranslateFn): string {
  if (mentions(reason, "no usable speech") || mentions(reason, "no audio")) {
    return t("shortform.findings.semanticNoSpeech");
  }
  if (
    mentions(reason, "language-model") ||
    mentions(reason, "provider failed") ||
    mentions(reason, "provider returned invalid") ||
    mentions(reason, "not configured") ||
    mentions(reason, "speech analysis is unavailable") ||
    mentions(reason, "were not evaluated")
  ) {
    return t("shortform.semanticUnavailable");
  }
  return t("shortform.semanticUnavailable");
}

const KNOWN_OPENING_REASONS = [
  "the opening does not present a clear subject",
  "main hook detected",
  "the video begins with a generic introduction",
  "clear opening subject",
  "the opening may take too long",
];

const KNOWN_CTA_REASONS = [
  "no clear call to action",
  "a call to action was detected",
  "detected at",
  "the closing call to action may need",
];

function unknownProviderReason(reason: string, known: readonly string[]): string | null {
  if (!reason.trim()) return null;
  if (known.some((needle) => mentions(reason, needle))) return null;
  return reason;
}

function localizeKnownRecommendation(
  recommendation: string | null,
  t: TranslateFn,
): string | null {
  if (!recommendation) return null;
  if (mentions(recommendation, "establish the viewer-facing subject")) {
    return t("shortform.findings.openingEarlier");
  }
  if (mentions(recommendation, "explicit next step")) {
    return t("shortform.findings.ctaNextStep");
  }
  if (mentions(recommendation, "pacing gap before publishing")) {
    return t("shortform.findings.pacingReview");
  }
  return null;
}

function fallbackCopy(finding: PreflightFinding, t: TranslateFn): FindingCopy {
  return {
    lead: t("shortform.findings.genericReview"),
    recommendation: localizeKnownRecommendation(finding.recommendation, t),
    providerDetail: finding.reason,
  };
}

function openingTime(finding: PreflightFinding): string | null {
  const measured = numberMeasure(finding, "hook_start_seconds");
  if (measured !== null) return formatTimestampPrecise(measured);
  if (finding.ranges[0]) return formatTimestampPrecise(finding.ranges[0].start_seconds);
  return timestampInReason(finding.reason);
}

function ctaTime(finding: PreflightFinding): string | null {
  const measured = numberMeasure(finding, "cta_start_seconds");
  if (measured !== null) return formatTimestampPrecise(measured);
  if (finding.ranges[0]) return formatTimestampPrecise(finding.ranges[0].start_seconds);
  return timestampInReason(finding.reason);
}

function pixelSize(finding: PreflightFinding): string | null {
  const width = numberMeasure(finding, "width");
  const height = numberMeasure(finding, "height");
  if (width === null || height === null) return null;
  return `${width} × ${height}`;
}

function pixelFallback(finding: PreflightFinding): string {
  return pixelSize(finding) ?? "—";
}

function orientationLabel(value: string | null, t: TranslateFn): string {
  if (value === "square") return t("shortform.findings.orientationSquare");
  if (value === "landscape") return t("shortform.findings.orientationLandscapeWord");
  if (value === "portrait") return t("shortform.findings.orientationPortraitWord");
  return value ?? t("shortform.findings.orientationUnknown");
}

function numberMeasure(finding: PreflightFinding, key: string): number | null {
  const value = finding.measurements?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringMeasure(finding: PreflightFinding, key: string): string | null {
  const value = finding.measurements?.[key];
  return typeof value === "string" && value ? value : null;
}

function mentions(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function timestampInReason(reason: string): string | null {
  const match = reason.match(/\b\d{2}:\d{2}(?::\d{2})?\.\d{2}\b/);
  return match ? match[0] : null;
}
