from collections.abc import Callable
from uuid import uuid4

from pydantic import ValidationError

from app.domain.extraction import (
    BriefExtractionOutput,
    BriefExtractionReport,
    ExtractedRequirement,
)
from app.domain.requirements import RequirementType, validate_requirement
from app.domain.text import normalize_unicode_whitespace
from app.integrations.llm.base import LLMRequirementExtractor
from app.integrations.llm.exceptions import LLMOutputValidationError
from app.integrations.llm.prompts import BRIEF_EXTRACTION_PROMPT_VERSION


MAX_BRIEF_CHARACTERS = 20_000
_MAX_ID_ATTEMPTS = 20


class BriefInputError(ValueError):
    """Raised when extraction is called directly with an invalid sponsor brief."""


def generate_requirement_id() -> str:
    return f"req_ai_{uuid4().hex}"


class BriefExtractionService:
    def __init__(
        self,
        provider: LLMRequirementExtractor,
        *,
        id_factory: Callable[[], str] = generate_requirement_id,
    ) -> None:
        self._provider = provider
        self._id_factory = id_factory

    async def extract(self, brief: str) -> BriefExtractionReport:
        normalized_brief = _validate_brief(brief)
        provider_output = await self._provider.extract_structured_requirements(
            normalized_brief
        )
        try:
            output = BriefExtractionOutput.model_validate(
                provider_output.model_dump(mode="python")
            )
            extracted = self._map_requirements(output)
        except (AttributeError, ValidationError) as error:
            raise LLMOutputValidationError(
                "The requirement extraction provider returned invalid structured output."
            ) from error

        return BriefExtractionReport(
            requirements=extracted,
            provider=self._provider.provider_name,
            model=self._provider.model_name,
            prompt_version=BRIEF_EXTRACTION_PROMPT_VERSION,
        )

    def _map_requirements(
        self,
        output: BriefExtractionOutput,
    ) -> tuple[ExtractedRequirement, ...]:
        allocated_ids: set[str] = set()
        mapped: list[ExtractedRequirement] = []
        for candidate in output.requirements:
            requirement_id = self._allocate_id(allocated_ids)
            payload: dict[str, object] = {
                "id": requirement_id,
                "type": candidate.type,
                "description": candidate.description,
                "value": candidate.value,
            }
            if candidate.type is RequirementType.REQUIRED_MENTION_BEFORE:
                payload["before_seconds"] = candidate.before_seconds
            requirement = validate_requirement(payload)
            mapped.append(
                ExtractedRequirement(
                    requirement=requirement,
                    source_text=candidate.source_text,
                )
            )
        return tuple(mapped)

    def _allocate_id(self, allocated_ids: set[str]) -> str:
        for _ in range(_MAX_ID_ATTEMPTS):
            candidate_id = self._id_factory()
            if candidate_id not in allocated_ids:
                allocated_ids.add(candidate_id)
                return candidate_id
        raise RuntimeError("Unable to allocate a unique requirement ID.")


def _validate_brief(brief: object) -> str:
    if not isinstance(brief, str):
        raise BriefInputError("Sponsor brief must be text.")
    normalized = normalize_unicode_whitespace(brief)
    if not normalized:
        raise BriefInputError("Sponsor brief cannot be blank.")
    if len(brief) > MAX_BRIEF_CHARACTERS:
        raise BriefInputError("Sponsor brief exceeds the allowed size.")
    return brief
