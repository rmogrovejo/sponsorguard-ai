from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.domain.media import FiniteSeconds
from app.domain.text import normalize_unicode_whitespace


class SpeechClipId(StrEnum):
    OPENING = "opening"
    ENDING = "ending"


class HookDecision(StrEnum):
    STRONG = "strong"
    REVIEW = "review"
    WEAK = "weak"
    NOT_EVALUATED = "not_evaluated"


class CtaDecision(StrEnum):
    FOUND = "found"
    NOT_FOUND = "not_found"
    REVIEW = "review"
    NOT_EVALUATED = "not_evaluated"


class SpeechActivityMethod(StrEnum):
    RMS_ENERGY_ESTIMATE = "rms_energy_estimate"


SPEECH_ACTIVITY_LABEL = "VOICE / SPEECH ACTIVITY ESTIMATE"


class SpeechActivityConfig(BaseModel):
    """RMS energy policy for a voice/speech-activity estimate.

    This is not a speech-versus-music classifier. Sustained energy above the
    threshold is treated as activity; music, effects, and voice can all trigger it.
    """

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    window_seconds: float = Field(default=0.25, gt=0, le=2, allow_inf_nan=False)
    rms_threshold: float = Field(default=0.015, ge=0, le=1, allow_inf_nan=False)
    min_activity_seconds: float = Field(default=0.4, gt=0, le=5, allow_inf_nan=False)
    sample_rate: int = Field(default=16_000, ge=8_000, le=48_000)


DEFAULT_SPEECH_ACTIVITY = SpeechActivityConfig()


class SpeechActivity(BaseModel):
    """Deterministic energy-based activity timestamps."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    audio_start_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    activity_start_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    has_usable_signal: bool
    method: SpeechActivityMethod = SpeechActivityMethod.RMS_ENERGY_ESTIMATE
    label: Literal["VOICE / SPEECH ACTIVITY ESTIMATE"] = SPEECH_ACTIVITY_LABEL

    @model_validator(mode="after")
    def validate_activity_requires_audio(self) -> Self:
        if self.activity_start_seconds is not None and self.audio_start_seconds is None:
            raise ValueError("activity_start_seconds requires audio_start_seconds")
        if self.has_usable_signal and self.activity_start_seconds is None:
            raise ValueError("usable speech activity requires an activity timestamp")
        if not self.has_usable_signal and self.activity_start_seconds is not None:
            raise ValueError("activity timestamp cannot be set without a usable signal")
        return self


class SpeechSegment(BaseModel):
    """Validated short-form speech span. Separate from SponsorGuard SRT cues."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    index: int = Field(ge=1, le=100)
    start_seconds: FiniteSeconds
    end_seconds: FiniteSeconds
    text: Annotated[str, StringConstraints(min_length=1, max_length=2_000)]

    @field_validator("text", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("text must be a string")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("text cannot be empty after normalization")
        return normalized

    @model_validator(mode="after")
    def validate_time_range(self) -> Self:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")
        return self


class ProviderSpeechSegment(BaseModel):
    """Untrusted provider speech span. Times are relative to the named clip."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    index: int = Field(ge=1, le=100)
    clip_id: SpeechClipId
    start_seconds: float = Field(ge=0, le=600, allow_inf_nan=False)
    end_seconds: float = Field(gt=0, le=600, allow_inf_nan=False)
    text: Annotated[str, StringConstraints(min_length=1, max_length=2_000)]

    @field_validator("text", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("text must be a string")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("text cannot be empty after normalization")
        return normalized

    @model_validator(mode="after")
    def validate_time_range(self) -> Self:
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")
        return self


class ProviderHookResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    decision: HookDecision
    segment_indices: tuple[int, ...] = Field(default=(), max_length=20)
    reason: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    generic_intro: bool = False

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("reason must be a string")
        reason = normalize_unicode_whitespace(value)
        if not reason:
            raise ValueError("reason cannot be empty")
        return reason

    @field_validator("segment_indices")
    @classmethod
    def validate_indices(cls, value: tuple[int, ...]) -> tuple[int, ...]:
        if any(index < 1 for index in value):
            raise ValueError("segment_indices must be positive")
        if len(set(value)) != len(value):
            raise ValueError("segment_indices must be unique")
        return value


class ProviderCtaResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    decision: CtaDecision
    segment_indices: tuple[int, ...] = Field(default=(), max_length=20)
    reason: Annotated[str, StringConstraints(min_length=1, max_length=500)]

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("reason must be a string")
        reason = normalize_unicode_whitespace(value)
        if not reason:
            raise ValueError("reason cannot be empty")
        return reason

    @field_validator("segment_indices")
    @classmethod
    def validate_indices(cls, value: tuple[int, ...]) -> tuple[int, ...]:
        if any(index < 1 for index in value):
            raise ValueError("segment_indices must be positive")
        if len(set(value)) != len(value):
            raise ValueError("segment_indices must be unique")
        return value


class ShortFormProviderDocument(BaseModel):
    """Strict Gemini document for one bounded short-form semantic request."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    segments: tuple[ProviderSpeechSegment, ...] = Field(default=(), max_length=40)
    hook: ProviderHookResult
    cta: ProviderCtaResult

    @model_validator(mode="after")
    def validate_unique_segment_indices(self) -> Self:
        indices = [segment.index for segment in self.segments]
        if len(set(indices)) != len(indices):
            raise ValueError("segment indices must be unique")
        return self


class ReviewPriority(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    rank: int = Field(ge=1, le=20)
    title: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    check_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    timestamp_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class GroundedSemanticCheck(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    evaluated: bool
    hook_decision: HookDecision
    cta_decision: CtaDecision
    hook_reason: str
    cta_reason: str
    hook_segment: SpeechSegment | None = None
    cta_segment: SpeechSegment | None = None
    generic_intro: bool = False
    hook_delay_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    failure_reason: str | None = None
    segments: tuple[SpeechSegment, ...] = ()
