import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from app.domain.shortform import ShortFormPlatform
from app.domain.shortform_suggestions import SuggestionOutcome, SuggestionType
from app.integrations.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMMalformedOutputError,
    LLMOutputValidationError,
    LLMProviderTimeoutError,
    LLMProviderUnavailableError,
    LLMRateLimitError,
)
from app.integrations.llm.gemini_shortform_suggestion_provider import (
    GeminiShortFormSuggestionGenerator,
)
from app.services.shortform_suggestions import build_suggestion_context
from tests.shortform_suggestion_fixtures import (
    OPENING_SEGMENTS,
    opening_finding,
    provider_output,
)


class FakeInteractions:
    def __init__(self, *, output_text: str = "", error: Exception | None = None) -> None:
        self.output_text = output_text
        self.error = error
        self.arguments: dict[str, object] = {}

    async def create(self, **kwargs: object) -> object:
        self.arguments = kwargs
        if self.error is not None:
            raise self.error
        return SimpleNamespace(output_text=self.output_text)


class FakeGeminiClient:
    def __init__(self, interactions: FakeInteractions) -> None:
        self.aio = SimpleNamespace(interactions=interactions)


def make_provider(interactions: FakeInteractions) -> GeminiShortFormSuggestionGenerator:
    return GeminiShortFormSuggestionGenerator(
        api_key="test-placeholder-not-a-real-key",
        model="gemini-3.7-flash",
        timeout_seconds=7,
        client=FakeGeminiClient(interactions),
    )


def context():
    return build_suggestion_context(
        opening_finding(),
        OPENING_SEGMENTS,
        finding_id=SuggestionType.OPENING,
        platform=ShortFormPlatform.TIKTOK,
        video_duration_seconds=30.0,
    )


def api_error(code: int, status: str, private_message: str) -> errors.APIError:
    error_type = errors.ServerError if code >= 500 else errors.ClientError
    return error_type(
        code,
        {"error": {"code": code, "status": status, "message": private_message}},
    )


def test_valid_structured_suggestion_is_accepted() -> None:
    interactions = FakeInteractions(output_text=provider_output().model_dump_json())
    result = asyncio.run(make_provider(interactions).generate_suggestion(context()))
    assert result.outcome is SuggestionOutcome.SUGGESTED
    assert result.suggested_text is not None
    assert "schema" in interactions.arguments["response_format"]


def test_timeout_is_translated() -> None:
    provider = make_provider(FakeInteractions(error=TimeoutError("late")))
    with pytest.raises(LLMProviderTimeoutError):
        asyncio.run(provider.generate_suggestion(context()))


def test_rate_limit_is_translated() -> None:
    provider = make_provider(
        FakeInteractions(error=api_error(429, "RESOURCE_EXHAUSTED", "quota secret"))
    )
    with pytest.raises(LLMRateLimitError):
        asyncio.run(provider.generate_suggestion(context()))


def test_unavailable_is_translated() -> None:
    provider = make_provider(
        FakeInteractions(error=api_error(503, "UNAVAILABLE", "backend down"))
    )
    with pytest.raises(LLMProviderUnavailableError):
        asyncio.run(provider.generate_suggestion(context()))


def test_malformed_output_is_rejected() -> None:
    provider = make_provider(FakeInteractions(output_text="{not-json"))
    with pytest.raises(LLMMalformedOutputError):
        asyncio.run(provider.generate_suggestion(context()))


def test_schema_invalid_output_is_rejected() -> None:
    payload = {"outcome": "suggested", "reason": "ok"}
    provider = make_provider(FakeInteractions(output_text=json.dumps(payload)))
    with pytest.raises(LLMOutputValidationError):
        asyncio.run(provider.generate_suggestion(context()))


def test_configuration_and_auth_failures_are_translated() -> None:
    auth = make_provider(
        FakeInteractions(error=api_error(401, "UNAUTHENTICATED", "bad key secret"))
    )
    with pytest.raises(LLMAuthenticationError):
        asyncio.run(auth.generate_suggestion(context()))

    config = make_provider(
        FakeInteractions(error=api_error(400, "INVALID_ARGUMENT", "bad config secret"))
    )
    with pytest.raises(LLMConfigurationError):
        asyncio.run(config.generate_suggestion(context()))


def test_httpx_timeout_is_translated() -> None:
    provider = make_provider(FakeInteractions(error=httpx.TimeoutException("late")))
    with pytest.raises(LLMProviderTimeoutError):
        asyncio.run(provider.generate_suggestion(context()))


def test_invalid_referenced_index_is_rejected_at_provider() -> None:
    payload = provider_output().model_dump()
    payload["referenced_segment_indices"] = [99]
    provider = make_provider(FakeInteractions(output_text=json.dumps(payload)))
    with pytest.raises(LLMOutputValidationError, match="unsupplied"):
        asyncio.run(provider.generate_suggestion(context()))
