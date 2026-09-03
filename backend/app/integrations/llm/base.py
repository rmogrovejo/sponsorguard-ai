from collections.abc import Sequence
from typing import Protocol

from app.domain.extraction import BriefExtractionOutput
from app.domain.semantic import SemanticRequirement, SemanticVerificationOutput
from app.domain.transcript import TranscriptSegment


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


class SemanticVerifier(Protocol):
    """Narrow provider boundary for one grounded semantic transcript chunk."""

    @property
    def provider_name(self) -> str: ...

    @property
    def model_name(self) -> str: ...

    async def verify_semantics(
        self,
        requirement: SemanticRequirement,
        transcript_segments: Sequence[TranscriptSegment],
    ) -> SemanticVerificationOutput: ...
