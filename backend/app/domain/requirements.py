from enum import StrEnum
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    TypeAdapter,
    ValidationInfo,
    field_validator,
)

from app.domain.text import normalize_unicode_whitespace
from app.domain.urls import CampaignURLValidationError, normalize_campaign_url


class RequirementType(StrEnum):
    REQUIRED_MENTION = "required_mention"
    REQUIRED_EXACT_TOKEN = "required_exact_token"
    FORBIDDEN_PHRASE = "forbidden_phrase"
    REQUIRED_MENTION_BEFORE = "required_mention_before"
    REQUIRED_URL = "required_url"
    REQUIRED_TALKING_POINT = "required_talking_point"
    FORBIDDEN_CLAIM = "forbidden_claim"


RequirementId = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z][A-Za-z0-9_-]*$",
    ),
]


class SponsorshipRequirement(BaseModel):
    """Shared immutable fields for supported sponsorship requirements."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: RequirementId
    type: RequirementType
    description: str = Field(min_length=1, max_length=500)
    value: str = Field(min_length=1, max_length=500)

    @field_validator("id", "description", "value", mode="before")
    @classmethod
    def normalize_required_text(cls, value: object, info: ValidationInfo) -> str:
        if not isinstance(value, str):
            raise ValueError(f"{info.field_name} must be a string")

        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError(f"{info.field_name} cannot be blank")
        return normalized


class RequiredMentionRequirement(SponsorshipRequirement):
    type: Literal[RequirementType.REQUIRED_MENTION] = RequirementType.REQUIRED_MENTION


class RequiredExactTokenRequirement(SponsorshipRequirement):
    type: Literal[RequirementType.REQUIRED_EXACT_TOKEN] = (
        RequirementType.REQUIRED_EXACT_TOKEN
    )


class ForbiddenPhraseRequirement(SponsorshipRequirement):
    type: Literal[RequirementType.FORBIDDEN_PHRASE] = RequirementType.FORBIDDEN_PHRASE


class RequiredMentionBeforeRequirement(SponsorshipRequirement):
    type: Literal[RequirementType.REQUIRED_MENTION_BEFORE] = (
        RequirementType.REQUIRED_MENTION_BEFORE
    )
    before_seconds: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("before_seconds", mode="before")
    @classmethod
    def validate_before_seconds(cls, value: object) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("before_seconds must be a finite number")
        return float(value)


class RequiredURLRequirement(SponsorshipRequirement):
    type: Literal[RequirementType.REQUIRED_URL] = RequirementType.REQUIRED_URL

    @field_validator("value")
    @classmethod
    def validate_and_normalize_url(cls, value: str) -> str:
        try:
            return normalize_campaign_url(value)
        except CampaignURLValidationError as error:
            raise ValueError("value must be a valid HTTP(S) campaign URL") from error


class RequiredTalkingPointRequirement(SponsorshipRequirement):
    """A meaning that the creator must communicate, without prescribed wording."""

    type: Literal[RequirementType.REQUIRED_TALKING_POINT] = (
        RequirementType.REQUIRED_TALKING_POINT
    )


class ForbiddenClaimRequirement(SponsorshipRequirement):
    """A prohibited meaning that may be communicated through a paraphrase."""

    type: Literal[RequirementType.FORBIDDEN_CLAIM] = RequirementType.FORBIDDEN_CLAIM


Requirement = Annotated[
    RequiredMentionRequirement
    | RequiredExactTokenRequirement
    | ForbiddenPhraseRequirement
    | RequiredMentionBeforeRequirement
    | RequiredURLRequirement
    | RequiredTalkingPointRequirement
    | ForbiddenClaimRequirement,
    Field(discriminator="type"),
]

_REQUIREMENT_ADAPTER: TypeAdapter[Requirement] = TypeAdapter(Requirement)


def validate_requirement(value: object) -> Requirement:
    """Validate untrusted data into one supported requirement model."""

    return _REQUIREMENT_ADAPTER.validate_python(value)
