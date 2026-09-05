from collections.abc import Sequence
from math import isfinite
from typing import Literal, Protocol, cast

import httpx
from google import genai
from google.genai import errors, types
from google.genai._gaos.lib import compat_errors
from pydantic import ValidationError

from app.domain.audience_pulse import AudienceComment, AudiencePulseProviderOutput
from app.integrations.llm.audience_pulse_prompts import (
    MAX_AUDIENCE_PROVIDER_INPUT_CHARACTERS,
    build_audience_pulse_input,
)
from app.integrations.llm.exceptions import (
    LLMConfigurationError,
    LLMMalformedOutputError,
    LLMOutputValidationError,
    LLMProviderTimeoutError,
    LLMProviderUnavailableError,
)
from app.integrations.llm.gemini_support import (
    gemini_response_schema,
    translate_api_error,
    translate_interactions_api_error,
)


class _AsyncInteractionsAPI(Protocol):
    async def create(self, **kwargs: object) -> object: ...


class _AsyncGeminiAPI(Protocol):
    interactions: _AsyncInteractionsAPI


class _GeminiClient(Protocol):
    aio: _AsyncGeminiAPI


class GeminiAudiencePulseAnalyzer:
    """Gemini adapter for Audience Pulse classification and grounded insights."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float,
        client: _GeminiClient | None = None,
    ) -> None:
        if not api_key.strip():
            raise LLMConfigurationError("The language-model provider is not configured.")
        if not model.strip():
            raise LLMConfigurationError("The language-model model is not configured.")
        if not isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise LLMConfigurationError("The language-model timeout is invalid.")
        self._model = model.strip()
        self._timeout_seconds = timeout_seconds
        self._client = client or cast(
            _GeminiClient,
            genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=int(timeout_seconds * 1_000)),
            ),
        )

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model

    async def analyze_audience(
        self,
        comments: Sequence[AudienceComment],
        *,
        analysis_language: Literal["en", "es"] = "en",
    ) -> AudiencePulseProviderOutput:
        comment_tuple = tuple(comments)
        if not comment_tuple:
            raise LLMConfigurationError("Audience Pulse requires at least one comment.")
        ids = [comment.id for comment in comment_tuple]
        if len(set(ids)) != len(ids):
            raise ValueError("audience comments require unique ids")

        provider_input = build_audience_pulse_input(
            comment_tuple,
            analysis_language=analysis_language,
        )
        if len(provider_input) > MAX_AUDIENCE_PROVIDER_INPUT_CHARACTERS:
            raise LLMConfigurationError(
                "The audience comment batch exceeds its safe provider bound."
            )

        try:
            interaction = await self._client.aio.interactions.create(
                model=self._model,
                input=provider_input,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": gemini_response_schema(AudiencePulseProviderOutput),
                },
                timeout=self._timeout_seconds,
            )
        except compat_errors.APIError as error:
            raise translate_interactions_api_error(error) from error
        except compat_errors.ResponseValidationError as error:
            raise LLMMalformedOutputError(
                "The audience provider returned malformed output."
            ) from error
        except errors.APIError as error:
            raise translate_api_error(error) from error
        except (TimeoutError, httpx.TimeoutException) as error:
            raise LLMProviderTimeoutError("The audience provider timed out.") from error
        except httpx.RequestError as error:
            raise LLMProviderUnavailableError(
                "The audience provider is unavailable."
            ) from error

        output_text = getattr(interaction, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            raise LLMMalformedOutputError(
                "The audience provider returned no structured output."
            )
        try:
            output = AudiencePulseProviderOutput.model_validate_json(output_text)
        except ValidationError as error:
            if any(item.get("type") == "json_invalid" for item in error.errors()):
                raise LLMMalformedOutputError(
                    "The audience provider returned malformed output."
                ) from error
            raise LLMOutputValidationError(
                "The audience provider returned invalid structured output."
            ) from error
        return output
