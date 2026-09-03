import asyncio

import pytest

from app.core.config import (
    DEFAULT_GEMINI_MODEL,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_OPENAI_MODEL,
    Settings,
)
from app.integrations.llm.exceptions import LLMConfigurationError
from app.integrations.llm.factory import create_requirement_extractor
from app.integrations.llm.gemini_provider import GeminiRequirementExtractor
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
    )

    provider = create_requirement_extractor(settings)

    assert isinstance(provider, GeminiRequirementExtractor)
    assert provider.provider_name == "gemini"
    assert provider.model_name == "gemini-configured-model"


def test_missing_gemini_key_returns_controlled_unconfigured_provider() -> None:
    provider = create_requirement_extractor(
        Settings(llm_provider="gemini", llm_model="gemini-3.7-flash")
    )

    with pytest.raises(LLMConfigurationError, match="not configured"):
        asyncio.run(provider.extract_structured_requirements("A sponsor brief"))


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
