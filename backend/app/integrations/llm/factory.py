from app.core.config import Settings
from app.domain.extraction import BriefExtractionOutput
from app.integrations.llm.base import LLMRequirementExtractor
from app.integrations.llm.exceptions import LLMConfigurationError
from app.integrations.llm.gemini_provider import GeminiRequirementExtractor
from app.integrations.llm.openai_provider import OpenAIRequirementExtractor


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
