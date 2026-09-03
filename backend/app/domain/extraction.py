from typing import Self

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from app.domain.requirements import Requirement, RequirementType
from app.domain.text import normalize_unicode_whitespace


MAX_EXTRACTED_REQUIREMENTS = 50


class BriefRequirementCandidate(BaseModel):
    """One untrusted structured rule proposed by the language model."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: RequirementType
    description: str = Field(min_length=1, max_length=500)
    value: str = Field(min_length=1, max_length=500)
    before_seconds: float | None
    source_text: str = Field(min_length=1, max_length=2_000)

    @field_validator("description", "value", mode="before")
    @classmethod
    def normalize_required_text(cls, value: object, info: ValidationInfo) -> str:
        if not isinstance(value, str):
            raise ValueError(f"{info.field_name} must be a string")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError(f"{info.field_name} cannot be blank")
        return normalized

    @field_validator("source_text", mode="before")
    @classmethod
    def preserve_nonblank_source_text(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("source_text must be a string")
        if not normalize_unicode_whitespace(value):
            raise ValueError("source_text cannot be blank")
        return value

    @field_validator("before_seconds", mode="before")
    @classmethod
    def validate_timing(cls, value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("before_seconds must be a finite number or null")
        number = float(value)
        if number < 0 or number == float("inf") or number == float("-inf") or number != number:
            raise ValueError("before_seconds must be a non-negative finite number")
        return number

    @model_validator(mode="after")
    def validate_timing_shape(self) -> Self:
        is_timed = self.type is RequirementType.REQUIRED_MENTION_BEFORE
        if is_timed and self.before_seconds is None:
            raise ValueError("timed mentions require before_seconds")
        if not is_timed and self.before_seconds is not None:
            raise ValueError("before_seconds is only supported for timed mentions")
        return self


class BriefExtractionOutput(BaseModel):
    """Strict provider output. Provider content is not trusted until this validates."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    requirements: tuple[BriefRequirementCandidate, ...] = Field(
        max_length=MAX_EXTRACTED_REQUIREMENTS
    )


class ExtractedRequirement(BaseModel):
    """A validated SponsorGuard requirement paired with its brief provenance."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    requirement: Requirement
    source_text: str = Field(min_length=1, max_length=2_000)


class BriefExtractionReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    requirements: tuple[ExtractedRequirement, ...]
    provider: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=50)
