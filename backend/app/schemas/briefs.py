from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.extraction import BriefExtractionReport
from app.domain.requirements import RequirementType
from app.services.brief_extraction import MAX_BRIEF_CHARACTERS


class BriefExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    brief: str = Field(min_length=1, max_length=MAX_BRIEF_CHARACTERS)

    @field_validator("brief")
    @classmethod
    def reject_blank_brief(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("sponsor brief cannot be blank")
        return value


class ExtractedRequirementResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    type: RequirementType
    description: str
    value: str
    before_seconds: float | None
    source_text: str


class BriefExtractionMetaResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    provider: str
    model: str
    prompt_version: str
    requirement_count: int


class BriefExtractResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    requirements: tuple[ExtractedRequirementResponse, ...]
    meta: BriefExtractionMetaResponse

    @classmethod
    def from_domain(cls, report: BriefExtractionReport) -> "BriefExtractResponse":
        requirements = tuple(
            ExtractedRequirementResponse(
                id=item.requirement.id,
                type=item.requirement.type,
                description=item.requirement.description,
                value=item.requirement.value,
                before_seconds=getattr(item.requirement, "before_seconds", None),
                source_text=item.source_text,
            )
            for item in report.requirements
        )
        return cls(
            requirements=requirements,
            meta=BriefExtractionMetaResponse(
                provider=report.provider,
                model=report.model,
                prompt_version=report.prompt_version,
                requirement_count=len(requirements),
            ),
        )
