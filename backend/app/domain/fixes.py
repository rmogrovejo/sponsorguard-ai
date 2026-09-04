from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.domain.requirements import RequirementId
from app.domain.text import normalize_unicode_whitespace


class FixAction(StrEnum):
    INSERT = "insert"
    REPLACE = "replace"
    REVIEW_MANUALLY = "review_manually"


class FixPlacementStrategy(StrEnum):
    AFTER_SEGMENT = "after_segment"
    REPLACE_SEGMENT = "replace_segment"
    BEFORE_DEADLINE = "before_deadline"
    REVIEW_SEGMENT = "review_segment"


FixSegmentIndex = Annotated[int, Field(strict=True, ge=0)]


class FixProviderOutput(BaseModel):
    """Strict provider output. It intentionally contains no timestamps or evidence."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    action: FixAction
    suggested_text: str | None = Field(default=None, max_length=1_000)
    referenced_segment_indices: tuple[FixSegmentIndex, ...] = Field(max_length=3)
    reason: Annotated[str, StringConstraints(min_length=1, max_length=1_000)]

    @field_validator("suggested_text", "reason", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("fix text fields must be strings")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("fix text fields cannot be blank")
        return normalized

    @model_validator(mode="after")
    def validate_action(self) -> Self:
        if len(set(self.referenced_segment_indices)) != len(
            self.referenced_segment_indices
        ):
            raise ValueError("referenced_segment_indices must not contain duplicates")
        if self.action in {FixAction.INSERT, FixAction.REPLACE}:
            if self.suggested_text is None:
                raise ValueError("insert and replace actions require suggested_text")
            if not self.referenced_segment_indices:
                raise ValueError("insert and replace actions require a grounded segment")
        return self


class FixPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    strategy: FixPlacementStrategy
    segment_index: FixSegmentIndex | None = None
    timestamp_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    before_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_bundle(self) -> Self:
        if (self.segment_index is None) != (self.timestamp_seconds is None):
            raise ValueError("segment index and timestamp must be supplied together")
        if self.strategy is FixPlacementStrategy.BEFORE_DEADLINE:
            if self.before_seconds is None:
                raise ValueError("before-deadline placement requires a deadline")
        elif self.before_seconds is not None:
            raise ValueError("before_seconds is only valid for before-deadline placement")
        return self


class GeneratedFix(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    requirement_id: RequirementId
    action: FixAction
    suggested_text: str | None = Field(default=None, max_length=1_000)
    placement: FixPlacement | None = None
    reason: Annotated[str, StringConstraints(min_length=1, max_length=1_000)]

    @field_validator("suggested_text", "reason", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("fix text fields must be strings")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("fix text fields cannot be blank")
        return normalized

    @model_validator(mode="after")
    def validate_action(self) -> Self:
        if self.action in {FixAction.INSERT, FixAction.REPLACE}:
            if self.suggested_text is None or self.placement is None:
                raise ValueError("insert and replace fixes require text and placement")
        return self
