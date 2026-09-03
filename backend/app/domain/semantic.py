from enum import StrEnum
from typing import Annotated, Self, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.domain.requirements import (
    ForbiddenClaimRequirement,
    RequiredTalkingPointRequirement,
)
from app.domain.text import normalize_unicode_whitespace


class SemanticDecision(StrEnum):
    MATCH = "match"
    NO_MATCH = "no_match"
    UNCERTAIN = "uncertain"


SemanticSegmentIndex = Annotated[int, Field(strict=True, ge=0)]
SemanticRequirement: TypeAlias = (
    RequiredTalkingPointRequirement | ForbiddenClaimRequirement
)


class SemanticVerificationOutput(BaseModel):
    """Strict, provider-neutral semantic decision for one transcript chunk."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    decision: SemanticDecision
    segment_indices: tuple[SemanticSegmentIndex, ...] = Field(max_length=10)
    reason: Annotated[str, StringConstraints(min_length=1, max_length=1_000)]

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("reason must be a string")
        reason = normalize_unicode_whitespace(value)
        if not reason:
            raise ValueError("reason cannot be blank")
        return reason

    @model_validator(mode="after")
    def validate_decision_evidence(self) -> Self:
        if len(set(self.segment_indices)) != len(self.segment_indices):
            raise ValueError("segment_indices must not contain duplicates")
        if self.decision is SemanticDecision.MATCH and not self.segment_indices:
            raise ValueError("a match must reference at least one supplied segment")
        if self.decision is SemanticDecision.NO_MATCH and self.segment_indices:
            raise ValueError("a no_match decision cannot reference evidence")
        return self


def is_semantic_requirement(value: object) -> bool:
    return isinstance(
        value,
        (RequiredTalkingPointRequirement, ForbiddenClaimRequirement),
    )
