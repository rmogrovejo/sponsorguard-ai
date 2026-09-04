from collections.abc import Sequence

from app.core.config import Settings
from app.domain.extraction import BriefExtractionOutput
from app.domain.fixes import FixProviderOutput
from app.domain.requirements import Requirement
from app.domain.semantic import SemanticRequirement, SemanticVerificationOutput
from app.domain.shortform_speech import ShortFormProviderDocument
from app.domain.transcript import TranscriptSegment
from app.integrations.llm.base import (
    FixGenerator,
    LLMRequirementExtractor,
    SemanticVerifier,
    ShortFormSemanticAnalyzer,
)
from app.integrations.llm.exceptions import LLMConfigurationError
from app.integrations.llm.gemini_provider import GeminiRequirementExtractor
from app.integrations.llm.gemini_fix_provider import GeminiFixGenerator
from app.integrations.llm.gemini_semantic_provider import GeminiSemanticVerifier
from app.integrations.llm.gemini_shortform_provider import GeminiShortFormAnalyzer
from app.integrations.llm.openai_provider import OpenAIRequirementExtractor
from app.integrations.llm.shortform_request import ShortFormSemanticRequest


class UnconfiguredRequirementExtractor:
    """Keeps the manual product usable when optional AI configuration is absent."""

    def __init__(
        self,
        *,
        provider_name: str,
        model_name: str,
        reason: str = "Requirement extraction is not configured on this server.",
    ) -> None:
        self._provider_name = provider_name
        self._model_name = model_name
        self._reason = reason

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    async def extract_structured_requirements(
        self,
        brief: str,
    ) -> BriefExtractionOutput:
        raise LLMConfigurationError(self._reason)


class UnconfiguredSemanticVerifier:
    """Turns optional-provider absence into a semantic-only review warning."""

    def __init__(
        self,
        *,
        provider_name: str,
        model_name: str,
        reason: str = "Semantic verification is not configured on this server.",
    ) -> None:
        self._provider_name = provider_name
        self._model_name = model_name
        self._reason = reason

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    async def verify_semantics(
        self,
        requirement: SemanticRequirement,
        transcript_segments: Sequence[TranscriptSegment],
    ) -> SemanticVerificationOutput:
        raise LLMConfigurationError(self._reason)


class UnconfiguredFixGenerator:
    """Keeps reports usable when optional fix generation is unavailable."""

    def __init__(
        self,
        *,
        provider_name: str,
        model_name: str,
        reason: str = "Fix generation is not configured on this server.",
    ) -> None:
        self._provider_name = provider_name
        self._model_name = model_name
        self._reason = reason

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    async def generate_fix(
        self,
        requirement: Requirement,
        transcript_segments: Sequence[TranscriptSegment],
    ) -> FixProviderOutput:
        raise LLMConfigurationError(self._reason)


class UnconfiguredShortFormAnalyzer:
    """Keeps deterministic short-form findings usable when Gemini is absent."""

    def __init__(
        self,
        *,
        provider_name: str,
        model_name: str,
        reason: str = "Short-form speech analysis is not configured on this server.",
    ) -> None:
        self._provider_name = provider_name
        self._model_name = model_name
        self._reason = reason

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    async def analyze_shortform(
        self,
        request: ShortFormSemanticRequest,
    ) -> ShortFormProviderDocument:
        raise LLMConfigurationError(self._reason)


def create_requirement_extractor(settings: Settings) -> LLMRequirementExtractor:
    provider_name = settings.llm_provider.strip().lower()
    model_name = settings.resolved_llm_model

    if provider_name == "gemini":
        if settings.gemini_api_key is None:
            return UnconfiguredRequirementExtractor(
                provider_name=provider_name,
                model_name=model_name,
            )
        return GeminiRequirementExtractor(
            api_key=settings.gemini_api_key,
            model=model_name,
            timeout_seconds=settings.llm_timeout_seconds,
        )

    if provider_name == "openai":
        if settings.openai_api_key is None:
            return UnconfiguredRequirementExtractor(
                provider_name=provider_name,
                model_name=model_name,
            )
        return OpenAIRequirementExtractor(
            api_key=settings.openai_api_key,
            model=model_name,
            timeout_seconds=settings.llm_timeout_seconds,
        )

    return UnconfiguredRequirementExtractor(
        provider_name=provider_name,
        model_name=model_name,
        reason=f"Unsupported language-model provider: {provider_name}",
    )


def create_semantic_verifier(settings: Settings) -> SemanticVerifier:
    provider_name = settings.llm_provider.strip().lower()
    model_name = settings.resolved_llm_model

    if provider_name == "gemini":
        if settings.gemini_api_key is None:
            return UnconfiguredSemanticVerifier(
                provider_name=provider_name,
                model_name=model_name,
            )
        return GeminiSemanticVerifier(
            api_key=settings.gemini_api_key,
            model=model_name,
            timeout_seconds=settings.semantic_timeout_seconds,
        )

    return UnconfiguredSemanticVerifier(
        provider_name=provider_name,
        model_name=model_name,
        reason=(
            f"Semantic verification is not implemented for provider: {provider_name}"
        ),
    )


def create_fix_generator(settings: Settings) -> FixGenerator:
    provider_name = settings.llm_provider.strip().lower()
    model_name = settings.resolved_llm_model

    if provider_name == "gemini":
        if settings.gemini_api_key is None:
            return UnconfiguredFixGenerator(
                provider_name=provider_name,
                model_name=model_name,
            )
        return GeminiFixGenerator(
            api_key=settings.gemini_api_key,
            model=model_name,
            timeout_seconds=settings.semantic_timeout_seconds,
        )

    return UnconfiguredFixGenerator(
        provider_name=provider_name,
        model_name=model_name,
        reason=f"Fix generation is not implemented for provider: {provider_name}",
    )


def create_shortform_analyzer(settings: Settings) -> ShortFormSemanticAnalyzer:
    provider_name = settings.llm_provider.strip().lower()
    model_name = settings.resolved_llm_model

    if provider_name == "gemini":
        if settings.gemini_api_key is None:
            return UnconfiguredShortFormAnalyzer(
                provider_name=provider_name,
                model_name=model_name,
            )
        return GeminiShortFormAnalyzer(
            api_key=settings.gemini_api_key,
            model=model_name,
            timeout_seconds=settings.semantic_timeout_seconds,
        )

    return UnconfiguredShortFormAnalyzer(
        provider_name=provider_name,
        model_name=model_name,
        reason=(
            f"Short-form speech analysis is not implemented for provider: {provider_name}"
        ),
    )
