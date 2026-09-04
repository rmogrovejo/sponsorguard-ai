from collections.abc import Sequence
from typing import Protocol

from app.domain.extraction import BriefExtractionOutput
from app.domain.fixes import FixProviderOutput
from app.domain.requirements import Requirement
from app.domain.semantic import SemanticRequirement, SemanticVerificationOutput
from app.domain.shortform_speech import ShortFormProviderDocument
from app.domain.shortform_suggestions import (
    ShortFormSuggestionContext,
    ShortFormSuggestionProviderOutput,
)
from app.domain.transcript import TranscriptSegment
from app.integrations.llm.shortform_request import ShortFormSemanticRequest


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


class FixGenerator(Protocol):
    """Narrow provider boundary for one bounded, advisory correction."""

    @property
    def provider_name(self) -> str: ...

    @property
    def model_name(self) -> str: ...

    async def generate_fix(
        self,
        requirement: Requirement,
        transcript_segments: Sequence[TranscriptSegment],
    ) -> FixProviderOutput: ...


class ShortFormSemanticAnalyzer(Protocol):
    """Narrow provider boundary for one bounded short-form hook and CTA review."""

    @property
    def provider_name(self) -> str: ...

    @property
    def model_name(self) -> str: ...

    async def analyze_shortform(
        self,
        request: ShortFormSemanticRequest,
    ) -> ShortFormProviderDocument: ...


class ShortFormSuggestionGenerator(Protocol):
    """Narrow provider boundary for one advisory opening or CTA suggestion."""

    @property
    def provider_name(self) -> str: ...

    @property
    def model_name(self) -> str: ...

    async def generate_suggestion(
        self,
        context: ShortFormSuggestionContext,
    ) -> ShortFormSuggestionProviderOutput: ...
