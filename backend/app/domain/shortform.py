from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.domain.compliance import (
    calculate_compliance_score,
    calculate_verification_coverage,
)
from app.domain.media import FiniteSeconds, MediaInspection, TimeRange
from app.domain.shortform_speech import ReviewPriority, SpeechActivity, SpeechSegment


class ShortFormPlatform(StrEnum):
    TIKTOK = "tiktok"
    YOUTUBE_SHORTS = "youtube_shorts"
    INSTAGRAM_REELS = "instagram_reels"


class PreflightStatus(StrEnum):
    PASS = "pass"
    WARNING = "warning"
    FAIL = "fail"
    NOT_EVALUATED = "not_evaluated"


class PreflightCategory(StrEnum):
    MEDIA = "media"
    FORMAT = "format"
    AUDIO = "audio"
    SPEECH = "speech"
    OPENING = "opening"
    PACING = "pacing"
    CTA = "cta"


class SilenceAnalysisConfig(BaseModel):
    """Documented energy policy for low-energy interval detection."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    window_seconds: float = Field(default=0.25, gt=0, le=2, allow_inf_nan=False)
    rms_threshold: float = Field(default=0.015, ge=0, le=1, allow_inf_nan=False)
    min_silence_seconds: float = Field(default=1.8, gt=0, le=30, allow_inf_nan=False)
    sample_rate: int = Field(default=16_000, ge=8_000, le=48_000)


DEFAULT_SILENCE_ANALYSIS = SilenceAnalysisConfig()


class PlatformProfile(BaseModel):
    """Preferred short-form guidance. These are not claimed official limits."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    platform: ShortFormPlatform
    label: str
    target_aspect_ratio: float = Field(gt=0, allow_inf_nan=False)
    aspect_tolerance: float = Field(ge=0, allow_inf_nan=False)
    preferred_min_width: int = Field(ge=1)
    preferred_min_height: int = Field(ge=1)
    min_duration_seconds: FiniteSeconds
    preferred_max_duration_seconds: FiniteSeconds
    max_duration_seconds: FiniteSeconds
    silence: SilenceAnalysisConfig = DEFAULT_SILENCE_ANALYSIS


PLATFORM_PROFILES: dict[ShortFormPlatform, PlatformProfile] = {
    ShortFormPlatform.TIKTOK: PlatformProfile(
        platform=ShortFormPlatform.TIKTOK,
        label="TikTok",
        target_aspect_ratio=9 / 16,
        aspect_tolerance=0.08,
        preferred_min_width=1080,
        preferred_min_height=1920,
        min_duration_seconds=3.0,
        preferred_max_duration_seconds=60.0,
        max_duration_seconds=180.0,
    ),
    ShortFormPlatform.YOUTUBE_SHORTS: PlatformProfile(
        platform=ShortFormPlatform.YOUTUBE_SHORTS,
        label="YouTube Shorts",
        target_aspect_ratio=9 / 16,
        aspect_tolerance=0.08,
        preferred_min_width=1080,
        preferred_min_height=1920,
        min_duration_seconds=3.0,
        preferred_max_duration_seconds=60.0,
        max_duration_seconds=60.0,
    ),
    ShortFormPlatform.INSTAGRAM_REELS: PlatformProfile(
        platform=ShortFormPlatform.INSTAGRAM_REELS,
        label="Instagram Reels",
        target_aspect_ratio=9 / 16,
        aspect_tolerance=0.08,
        preferred_min_width=1080,
        preferred_min_height=1920,
        min_duration_seconds=3.0,
        preferred_max_duration_seconds=90.0,
        max_duration_seconds=180.0,
    ),
}


class PreflightFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    check_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    category: PreflightCategory
    status: PreflightStatus
    title: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    reason: Annotated[str, StringConstraints(min_length=1, max_length=1_000)]
    recommendation: str | None = Field(default=None, max_length=1_000)
    evidence_text: str | None = Field(default=None, max_length=2_000)
    ranges: tuple[TimeRange, ...] = ()
    measurements: dict[str, float | int | str] | None = None


class PreflightSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    total: int = Field(ge=1)
    evaluated: int = Field(ge=0)
    not_evaluated: int = Field(ge=0)
    passed: int = Field(ge=0)
    warnings: int = Field(ge=0)
    failed: int = Field(ge=0)
    readiness_score: float | None
    verification_coverage: float


class ShortFormReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    platform: ShortFormPlatform
    media: MediaInspection
    summary: PreflightSummary
    findings: tuple[PreflightFinding, ...]
    speech: SpeechActivity | None = None
    speech_segments: tuple[SpeechSegment, ...] = ()
    priorities: tuple[ReviewPriority, ...] = ()


def get_platform_profile(platform: ShortFormPlatform) -> PlatformProfile:
    return PLATFORM_PROFILES[platform]


# Hook decisions map to report statuses:
#   STRONG → PASS, REVIEW → WARNING, WEAK → WARNING, NOT_EVALUATED → NOT_EVALUATED
# CTA decisions map to report statuses:
#   FOUND → PASS, NOT_FOUND → WARNING, REVIEW → WARNING, NOT_EVALUATED → NOT_EVALUATED
# WEAK and missing CTA stay WARNING. They are recommendations, not hard failures.
# Readiness uses PASS=1, WARNING=0.5, FAIL=0. NOT_EVALUATED is excluded.


def summarize_preflight(findings: tuple[PreflightFinding, ...]) -> PreflightSummary:
    if not findings:
        raise ValueError("cannot summarize an empty preflight")
    total = len(findings)
    passed = sum(item.status is PreflightStatus.PASS for item in findings)
    warnings = sum(item.status is PreflightStatus.WARNING for item in findings)
    failed = sum(item.status is PreflightStatus.FAIL for item in findings)
    not_evaluated = sum(
        item.status is PreflightStatus.NOT_EVALUATED for item in findings
    )
    evaluated = total - not_evaluated
    return PreflightSummary(
        total=total,
        evaluated=evaluated,
        not_evaluated=not_evaluated,
        passed=passed,
        warnings=warnings,
        failed=failed,
        readiness_score=calculate_compliance_score(
            evaluated=evaluated,
            passed=passed,
            warnings=warnings,
        ),
        verification_coverage=calculate_verification_coverage(
            total=total,
            evaluated=evaluated,
        ),
    )
