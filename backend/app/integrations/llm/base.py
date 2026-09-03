from typing import Protocol

from app.domain.extraction import BriefExtractionOutput


class LLMRequirementExtractor(Protocol):
    """The only language-model behavior SponsorGuard depends on."""

    @property
    def provider_name(self) -> str: ...

    @property
    def model_name(self) -> str: ...

    async def extract_structured_requirements(
        self,
        brief: str,
    ) -> BriefExtractionOutput: ...
