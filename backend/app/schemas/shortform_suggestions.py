from pydantic import BaseModel, ConfigDict, Field

from app.domain.media import TimeRange
from app.domain.shortform import (
    PreflightCategory,
    PreflightFinding,
    PreflightStatus,
    ShortFormPlatform,
)
from app.domain.shortform_speech import SpeechSegment
from app.domain.shortform_suggestions import (
    ShortFormSuggestion,
    ShortFormSuggestionPlacement,
    SuggestionOutcome,
    SuggestionPlacementStrategy,
    SuggestionType,
)


class SuggestionTimeRangeInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    start_seconds: float = Field(ge=0, allow_inf_nan=False)
    end_seconds: float = Field(gt=0, allow_inf_nan=False)
    duration_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    def to_domain(self) -> TimeRange:
        return TimeRange(start_seconds=self.start_seconds, end_seconds=self.end_seconds)


class SuggestionFindingInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    check_id: str
    category: PreflightCategory
    status: PreflightStatus
    title: str
    reason: str
    recommendation: str | None = None
    evidence_text: str | None = None
    ranges: tuple[SuggestionTimeRangeInput, ...] = ()
    measurements: dict[str, float | int | str] | None = None

    def to_domain(self) -> PreflightFinding:
        return PreflightFinding(
            check_id=self.check_id,
            category=self.category,
            status=self.status,
            title=self.title,
            reason=self.reason,
            recommendation=self.recommendation,
            evidence_text=self.evidence_text,
            ranges=tuple(item.to_domain() for item in self.ranges),
            measurements=self.measurements,
        )


class SuggestionSpeechSegmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    index: int
    start_seconds: float
    end_seconds: float
    text: str

    def to_domain(self) -> SpeechSegment:
        return SpeechSegment(
            index=self.index,
            start_seconds=self.start_seconds,
            end_seconds=self.end_seconds,
            text=self.text,
        )


class ShortFormSuggestionGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    finding_id: SuggestionType
    platform: ShortFormPlatform
    finding: SuggestionFindingInput
    speech_segments: tuple[SuggestionSpeechSegmentInput, ...] = Field(max_length=40)
    video_duration_seconds: float = Field(gt=0, le=600, allow_inf_nan=False)


class ShortFormSuggestionPlacementResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    strategy: SuggestionPlacementStrategy
    start_seconds: float | None
    end_seconds: float | None
    after_seconds: float | None

    @classmethod
    def from_domain(
        cls, value: ShortFormSuggestionPlacement
    ) -> "ShortFormSuggestionPlacementResponse":
        return cls(
            strategy=value.strategy,
            start_seconds=value.start_seconds,
            end_seconds=value.end_seconds,
            after_seconds=value.after_seconds,
        )


class ShortFormSuggestionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    finding_id: SuggestionType
    type: SuggestionType
    outcome: SuggestionOutcome
    suggested_text: str | None
    reason: str
    referenced_segment_indices: tuple[int, ...]
    placement: ShortFormSuggestionPlacementResponse
    display_label: str

    @classmethod
    def from_domain(cls, value: ShortFormSuggestion) -> "ShortFormSuggestionResponse":
        return cls(
            finding_id=value.finding_id,
            type=value.type,
            outcome=value.outcome,
            suggested_text=value.suggested_text,
            reason=value.reason,
            referenced_segment_indices=value.referenced_segment_indices,
            placement=ShortFormSuggestionPlacementResponse.from_domain(value.placement),
            display_label=value.display_label,
        )
