from pydantic import BaseModel, ConfigDict, Field

from app.domain.media import MediaInspection, MediaOrientation, TimeRange
from app.domain.shortform import (
    PreflightCategory,
    PreflightFinding,
    PreflightStatus,
    PreflightSummary,
    ShortFormPlatform,
    ShortFormReport,
)
from app.domain.shortform_speech import ReviewPriority, SpeechActivity, SpeechSegment


class TimeRangeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    start_seconds: float
    end_seconds: float
    duration_seconds: float

    @classmethod
    def from_domain(cls, value: TimeRange) -> "TimeRangeResponse":
        return cls(
            start_seconds=value.start_seconds,
            end_seconds=value.end_seconds,
            duration_seconds=value.duration_seconds,
        )


class MediaInspectionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    filename: str
    size_bytes: int
    duration_seconds: float
    width: int
    height: int
    aspect_ratio: float
    orientation: MediaOrientation
    has_audio: bool

    @classmethod
    def from_domain(cls, media: MediaInspection) -> "MediaInspectionResponse":
        return cls(
            filename=media.display_filename,
            size_bytes=media.size_bytes,
            duration_seconds=media.duration_seconds,
            width=media.width,
            height=media.height,
            aspect_ratio=round(media.aspect_ratio, 4),
            orientation=media.orientation,
            has_audio=media.has_audio,
        )


class PreflightFindingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    check_id: str
    category: PreflightCategory
    status: PreflightStatus
    title: str
    reason: str
    recommendation: str | None
    evidence_text: str | None
    ranges: tuple[TimeRangeResponse, ...]
    measurements: dict[str, float | int | str] | None

    @classmethod
    def from_domain(cls, finding: PreflightFinding) -> "PreflightFindingResponse":
        return cls(
            check_id=finding.check_id,
            category=finding.category,
            status=finding.status,
            title=finding.title,
            reason=finding.reason,
            recommendation=finding.recommendation,
            evidence_text=finding.evidence_text,
            ranges=tuple(TimeRangeResponse.from_domain(item) for item in finding.ranges),
            measurements=finding.measurements,
        )


class SpeechActivityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    audio_start_seconds: float | None
    activity_start_seconds: float | None
    has_usable_signal: bool
    method: str
    label: str

    @classmethod
    def from_domain(cls, value: SpeechActivity) -> "SpeechActivityResponse":
        return cls(
            audio_start_seconds=value.audio_start_seconds,
            activity_start_seconds=value.activity_start_seconds,
            has_usable_signal=value.has_usable_signal,
            method=value.method.value,
            label=value.label,
        )


class SpeechSegmentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    index: int
    start_seconds: float
    end_seconds: float
    text: str

    @classmethod
    def from_domain(cls, value: SpeechSegment) -> "SpeechSegmentResponse":
        return cls(
            index=value.index,
            start_seconds=value.start_seconds,
            end_seconds=value.end_seconds,
            text=value.text,
        )


class ReviewPriorityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rank: int
    title: str
    check_id: str
    timestamp_seconds: float | None

    @classmethod
    def from_domain(cls, value: ReviewPriority) -> "ReviewPriorityResponse":
        return cls(
            rank=value.rank,
            title=value.title,
            check_id=value.check_id,
            timestamp_seconds=value.timestamp_seconds,
        )


class PreflightSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    total: int
    evaluated: int
    not_evaluated: int
    passed: int
    warnings: int
    failed: int
    readiness_score: float | None
    verification_coverage: float


class ShortFormAnalyzeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    platform: ShortFormPlatform
    media: MediaInspectionResponse
    summary: PreflightSummaryResponse
    findings: tuple[PreflightFindingResponse, ...]
    speech: SpeechActivityResponse | None
    speech_segments: tuple[SpeechSegmentResponse, ...]
    priorities: tuple[ReviewPriorityResponse, ...]

    @classmethod
    def from_domain(cls, report: ShortFormReport) -> "ShortFormAnalyzeResponse":
        return cls(
            platform=report.platform,
            media=MediaInspectionResponse.from_domain(report.media),
            summary=PreflightSummaryResponse(
                total=report.summary.total,
                evaluated=report.summary.evaluated,
                not_evaluated=report.summary.not_evaluated,
                passed=report.summary.passed,
                warnings=report.summary.warnings,
                failed=report.summary.failed,
                readiness_score=report.summary.readiness_score,
                verification_coverage=report.summary.verification_coverage,
            ),
            findings=tuple(
                PreflightFindingResponse.from_domain(item) for item in report.findings
            ),
            speech=(
                SpeechActivityResponse.from_domain(report.speech)
                if report.speech is not None
                else None
            ),
            speech_segments=tuple(
                SpeechSegmentResponse.from_domain(item) for item in report.speech_segments
            ),
            priorities=tuple(
                ReviewPriorityResponse.from_domain(item) for item in report.priorities
            ),
        )


class ShortFormAnalyzeForm(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    platform: ShortFormPlatform = Field(description="Short-form platform preset")
