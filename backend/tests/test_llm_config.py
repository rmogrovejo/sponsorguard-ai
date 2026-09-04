import asyncio

import pytest

from app.core.config import (
    DEFAULT_GEMINI_MODEL,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_LLM_TIMEOUT_SECONDS,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_SEMANTIC_TIMEOUT_SECONDS,
    Settings,
)
from app.integrations.llm.exceptions import LLMConfigurationError
from app.domain.requirements import RequiredTalkingPointRequirement
from app.domain.transcript import TranscriptSegment
from app.domain.shortform import ShortFormPlatform
from app.domain.shortform_suggestions import SuggestionType
from app.integrations.llm.factory import (
    create_fix_generator,
    create_requirement_extractor,
    create_semantic_verifier,
    create_shortform_analyzer,
    create_shortform_suggestion_generator,
)
from app.integrations.llm.gemini_shortform_provider import GeminiShortFormAnalyzer
from app.integrations.llm.gemini_shortform_suggestion_provider import (
    GeminiShortFormSuggestionGenerator,
)
from app.integrations.llm.shortform_request import ShortFormSemanticRequest
from app.services.shortform_suggestions import build_suggestion_context
from tests.shortform_suggestion_fixtures import OPENING_SEGMENTS, opening_finding
from app.domain.media import TimeRange
from app.integrations.llm.gemini_provider import GeminiRequirementExtractor
from app.integrations.llm.gemini_fix_provider import GeminiFixGenerator
from app.integrations.llm.gemini_semantic_provider import GeminiSemanticVerifier
from app.integrations.llm.openai_provider import OpenAIRequirementExtractor


def test_gemini_is_the_documented_default_provider_and_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SPONSORGUARD_LLM_PROVIDER", raising=False)
    monkeypatch.delenv("SPONSORGUARD_LLM_MODEL", raising=False)

    settings = Settings.from_environment()

    assert DEFAULT_LLM_PROVIDER == "gemini"
    assert DEFAULT_GEMINI_MODEL == "gemini-3.7-flash"
    assert settings.llm_provider == "gemini"
    assert settings.resolved_llm_model == "gemini-3.7-flash"


def test_semantic_timeout_has_an_independent_sixty_second_default() -> None:
    settings = Settings()

    assert DEFAULT_LLM_TIMEOUT_SECONDS == 20.0
    assert DEFAULT_SEMANTIC_TIMEOUT_SECONDS == 60.0
    assert settings.llm_timeout_seconds == 20.0
    assert settings.semantic_timeout_seconds == 60.0


def test_extraction_and_semantic_timeout_environment_overrides_are_independent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SPONSORGUARD_LLM_TIMEOUT_SECONDS", "17.5")
    monkeypatch.setenv("SPONSORGUARD_SEMANTIC_TIMEOUT_SECONDS", "72")

    settings = Settings.from_environment()

    assert settings.llm_timeout_seconds == 17.5
    assert settings.semantic_timeout_seconds == 72.0


def test_gemini_model_environment_variable_overrides_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SPONSORGUARD_LLM_PROVIDER", "gemini")
    monkeypatch.setenv("SPONSORGUARD_LLM_MODEL", "gemini-test-override")

    settings = Settings.from_environment()

    assert settings.resolved_llm_model == "gemini-test-override"


def test_gemini_selected_through_configuration() -> None:
    settings = Settings(
        llm_provider="gemini",
        llm_model="gemini-configured-model",
        gemini_api_key="test-placeholder-not-a-real-key",
        llm_timeout_seconds=11,
        semantic_timeout_seconds=73,
    )

    provider = create_requirement_extractor(settings)

    assert isinstance(provider, GeminiRequirementExtractor)
    assert provider.provider_name == "gemini"
    assert provider.model_name == "gemini-configured-model"
    assert provider._timeout_seconds == 11  # type: ignore[attr-defined]


def test_missing_gemini_key_returns_controlled_unconfigured_provider() -> None:
    provider = create_requirement_extractor(
        Settings(llm_provider="gemini", llm_model="gemini-3.7-flash")
    )

    with pytest.raises(LLMConfigurationError, match="not configured"):
        asyncio.run(provider.extract_structured_requirements("A sponsor brief"))


def test_gemini_semantic_verifier_is_selected_through_same_configuration() -> None:
    verifier = create_semantic_verifier(
        Settings(
            llm_provider="gemini",
            llm_model="gemini-configured-model",
            gemini_api_key="test-placeholder-not-a-real-key",
            llm_timeout_seconds=11,
            semantic_timeout_seconds=73,
        )
    )

    assert isinstance(verifier, GeminiSemanticVerifier)
    assert verifier.provider_name == "gemini"
    assert verifier.model_name == "gemini-configured-model"
    assert verifier._timeout_seconds == 73  # type: ignore[attr-defined]


def test_missing_gemini_key_returns_unconfigured_semantic_boundary() -> None:
    verifier = create_semantic_verifier(
        Settings(llm_provider="gemini", llm_model="gemini-3.7-flash")
    )
    requirement = RequiredTalkingPointRequirement(
        id="req_semantic",
        description="Explain the benefit",
        value="The product reduces editing time",
    )
    transcript = [
        TranscriptSegment(
            index=1,
            start_seconds=0.0,
            end_seconds=1.0,
            text="A transcript.",
        )
    ]

    with pytest.raises(LLMConfigurationError, match="not configured"):
        asyncio.run(verifier.verify_semantics(requirement, transcript))


def test_gemini_fix_generator_uses_semantic_timeout_configuration() -> None:
    generator = create_fix_generator(
        Settings(
            llm_provider="gemini",
            llm_model="gemini-configured-model",
            gemini_api_key="test-placeholder-not-a-real-key",
            llm_timeout_seconds=11,
            semantic_timeout_seconds=73,
        )
    )

    assert isinstance(generator, GeminiFixGenerator)
    assert generator.model_name == "gemini-configured-model"
    assert generator._timeout_seconds == 73  # type: ignore[attr-defined]


def test_missing_key_keeps_fix_generation_behind_controlled_boundary() -> None:
    generator = create_fix_generator(Settings())
    requirement = RequiredTalkingPointRequirement(
        id="req_semantic",
        description="Explain the benefit",
        value="The product reduces editing time",
    )
    transcript = [
        TranscriptSegment(index=1, start_seconds=0.0, end_seconds=1.0, text="A transcript.")
    ]

    with pytest.raises(LLMConfigurationError, match="not configured"):
        asyncio.run(generator.generate_fix(requirement, transcript))


def test_unsupported_provider_is_rejected_through_controlled_boundary() -> None:
    provider = create_requirement_extractor(
        Settings(llm_provider="unsupported", llm_model="some-model")
    )

    with pytest.raises(LLMConfigurationError, match="Unsupported"):
        asyncio.run(provider.extract_structured_requirements("A sponsor brief"))


def test_openai_provider_and_provider_specific_default_remain_supported() -> None:
    settings = Settings(
        llm_provider="openai",
        openai_api_key="test-placeholder-not-a-real-key",
    )

    provider = create_requirement_extractor(settings)

    assert DEFAULT_OPENAI_MODEL == "gpt-5.6-luna"
    assert isinstance(provider, OpenAIRequirementExtractor)
    assert provider.provider_name == "openai"
    assert provider.model_name == "gpt-5.6-luna"


def test_gemini_shortform_analyzer_uses_semantic_timeout_configuration() -> None:
    analyzer = create_shortform_analyzer(
        Settings(
            llm_provider="gemini",
            llm_model="gemini-configured-model",
            gemini_api_key="test-placeholder-not-a-real-key",
            llm_timeout_seconds=11,
            semantic_timeout_seconds=73,
        )
    )

    assert isinstance(analyzer, GeminiShortFormAnalyzer)
    assert analyzer.model_name == "gemini-configured-model"
    assert analyzer._timeout_seconds == 73  # type: ignore[attr-defined]


def test_missing_key_keeps_shortform_analysis_behind_controlled_boundary() -> None:
    analyzer = create_shortform_analyzer(Settings())
    request = ShortFormSemanticRequest(
        opening=TimeRange(start_seconds=0.0, end_seconds=8.0),
        ending=TimeRange(start_seconds=12.0, end_seconds=15.0),
        video_duration_seconds=15.0,
    )

    with pytest.raises(LLMConfigurationError, match="not configured"):
        asyncio.run(analyzer.analyze_shortform(request))


def test_gemini_shortform_suggestion_generator_uses_semantic_timeout() -> None:
    generator = create_shortform_suggestion_generator(
        Settings(
            llm_provider="gemini",
            llm_model="gemini-configured-model",
            gemini_api_key="test-placeholder-not-a-real-key",
            llm_timeout_seconds=11,
            semantic_timeout_seconds=73,
        )
    )

    assert isinstance(generator, GeminiShortFormSuggestionGenerator)
    assert generator.model_name == "gemini-configured-model"
    assert generator._timeout_seconds == 73  # type: ignore[attr-defined]


def test_missing_key_keeps_shortform_suggestions_behind_controlled_boundary() -> None:
    generator = create_shortform_suggestion_generator(Settings())
    context = build_suggestion_context(
        opening_finding(),
        OPENING_SEGMENTS,
        finding_id=SuggestionType.OPENING,
        platform=ShortFormPlatform.TIKTOK,
        video_duration_seconds=30.0,
    )

    with pytest.raises(LLMConfigurationError, match="not configured"):
        asyncio.run(generator.generate_suggestion(context))


def test_provider_keys_are_excluded_from_settings_representation() -> None:
    gemini_secret = "private-gemini-placeholder"
    openai_secret = "private-openai-placeholder"
    settings = Settings(
        gemini_api_key=gemini_secret,
        openai_api_key=openai_secret,
    )

    representation = repr(settings)

    assert gemini_secret not in representation
    assert openai_secret not in representation
