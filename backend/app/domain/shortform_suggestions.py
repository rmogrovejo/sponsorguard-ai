from enum import StrEnum
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.domain.media import TimeRange
from app.domain.shortform import PreflightFinding, PreflightStatus, ShortFormPlatform
from app.domain.shortform_speech import SpeechSegment
from app.domain.text import normalize_unicode_whitespace


class SuggestionType(StrEnum):
    OPENING = "opening"
    CTA = "cta"


class SuggestionOutcome(StrEnum):
    SUGGESTED = "suggested"
    REVIEW_MANUALLY = "review_manually"


class SuggestionPlacementStrategy(StrEnum):
    REPLACE_OPENING = "replace_opening"
    OPENING_FIRST_SECONDS = "opening_first_seconds"
    APPEND_NEAR_END = "append_near_end"


MAX_SUGGESTED_TEXT_CHARACTERS = 180
MAX_SUGGESTION_REASON_CHARACTERS = 400


class ShortFormSuggestionPlacement(BaseModel):
    """Placement resolved from validated opening or ending evidence only."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    strategy: SuggestionPlacementStrategy
    start_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    end_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    after_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_bundle(self) -> Self:
        if self.strategy is SuggestionPlacementStrategy.REPLACE_OPENING:
            if self.start_seconds is None or self.end_seconds is None:
                raise ValueError("replace_opening requires a validated time range")
            if self.end_seconds <= self.start_seconds:
                raise ValueError("replace_opening end must be after start")
            if self.after_seconds is not None:
                raise ValueError("replace_opening cannot include after_seconds")
            return self
        if self.strategy is SuggestionPlacementStrategy.OPENING_FIRST_SECONDS:
            if (
                self.start_seconds is not None
                or self.end_seconds is not None
                or self.after_seconds is not None
            ):
                raise ValueError("opening_first_seconds cannot invent timestamps")
            return self
        if self.after_seconds is None:
            if self.start_seconds is not None or self.end_seconds is not None:
                raise ValueError("append_near_end timestamps must use after_seconds")
            return self
        if self.start_seconds is not None or self.end_seconds is not None:
            raise ValueError("append_near_end cannot mix range and after_seconds")
        return self


class ShortFormSuggestionContext(BaseModel):
    """Bounded opening or ending speech sent to the suggestion provider."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    suggestion_type: SuggestionType
    platform: ShortFormPlatform
    finding_status: PreflightStatus
    finding_reason: Annotated[str, StringConstraints(min_length=1, max_length=1_000)]
    segments: tuple[SpeechSegment, ...] = Field(default=(), max_length=8)
    evidence_text: str | None = Field(default=None, max_length=2_000)
    finding_ranges: tuple[TimeRange, ...] = Field(default=(), max_length=8)
    video_duration_seconds: float = Field(gt=0, le=600, allow_inf_nan=False)

    @field_validator("finding_reason", "evidence_text", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("text fields must be strings")
        normalized = normalize_unicode_whitespace(value)
        return normalized or None


class ShortFormSuggestionProviderOutput(BaseModel):
    """Strict structured output from the Short-Form suggestion provider."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    outcome: SuggestionOutcome
    suggested_text: str | None = Field(
        default=None, max_length=MAX_SUGGESTED_TEXT_CHARACTERS
    )
    reason: Annotated[
        str, StringConstraints(min_length=1, max_length=MAX_SUGGESTION_REASON_CHARACTERS)
    ]
    referenced_segment_indices: tuple[int, ...] = Field(default=(), max_length=8)

    @field_validator("suggested_text", "reason", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("suggestion text fields must be strings")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("suggestion text fields cannot be blank")
        return normalized

    @field_validator("referenced_segment_indices")
    @classmethod
    def validate_indices(cls, value: tuple[int, ...]) -> tuple[int, ...]:
        if any(index < 1 for index in value):
            raise ValueError("referenced_segment_indices must be positive")
        if len(set(value)) != len(value):
            raise ValueError("referenced_segment_indices must be unique")
        return value

    @model_validator(mode="after")
    def validate_outcome(self) -> Self:
        if self.outcome is SuggestionOutcome.SUGGESTED:
            if self.suggested_text is None:
                raise ValueError("suggested outcome requires suggested_text")
        elif self.suggested_text is not None:
            raise ValueError("review_manually cannot include suggested_text")
        return self


class ShortFormSuggestion(BaseModel):
    """Advisory Short-Form suggestion. Never applied automatically."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    finding_id: SuggestionType
    type: SuggestionType
    outcome: SuggestionOutcome
    suggested_text: str | None = Field(
        default=None, max_length=MAX_SUGGESTED_TEXT_CHARACTERS
    )
    reason: Annotated[
        str, StringConstraints(min_length=1, max_length=MAX_SUGGESTION_REASON_CHARACTERS)
    ]
    referenced_segment_indices: tuple[int, ...] = Field(default=(), max_length=8)
    placement: ShortFormSuggestionPlacement
    display_label: Annotated[str, StringConstraints(min_length=1, max_length=40)]

    @model_validator(mode="after")
    def validate_identity(self) -> Self:
        if self.finding_id is not self.type:
            raise ValueError("finding_id and type must match")
        expected = (
            "SUGGESTED OPENING" if self.type is SuggestionType.OPENING else "SUGGESTED CTA"
        )
        if self.display_label != expected:
            raise ValueError("display_label must match the suggestion type")
        if self.outcome is SuggestionOutcome.SUGGESTED and self.suggested_text is None:
            raise ValueError("suggested outcome requires suggested_text")
        if (
            self.outcome is SuggestionOutcome.REVIEW_MANUALLY
            and self.suggested_text is not None
        ):
            raise ValueError("review_manually cannot include suggested_text")
        return self


def suggestion_display_label(suggestion_type: SuggestionType) -> str:
    if suggestion_type is SuggestionType.OPENING:
        return "SUGGESTED OPENING"
    return "SUGGESTED CTA"


def suggestion_type_for_finding(finding: PreflightFinding) -> SuggestionType | None:
    if finding.check_id == SuggestionType.OPENING:
        return SuggestionType.OPENING
    if finding.check_id == SuggestionType.CTA:
        return SuggestionType.CTA
    return None
