from __future__ import annotations

from math import isfinite
from typing import Protocol, cast

import httpx
from google import genai
from google.genai import errors, types
from google.genai._gaos.lib import compat_errors
from pydantic import ValidationError

from app.domain.shortform_suggestions import (
    ShortFormSuggestionContext,
    ShortFormSuggestionProviderOutput,
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
from app.integrations.llm.shortform_suggestion_prompts import (
    MAX_SHORTFORM_SUGGESTION_INPUT_CHARACTERS,
    build_shortform_suggestion_input,
)


class _AsyncInteractionsAPI(Protocol):
    async def create(self, **kwargs: object) -> object: ...


class _AsyncGeminiAPI(Protocol):
    interactions: _AsyncInteractionsAPI


class _GeminiClient(Protocol):
    aio: _AsyncGeminiAPI


class GeminiShortFormSuggestionGenerator:
    """Gemini adapter for one bounded Short-Form opening or CTA suggestion."""

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

    async def generate_suggestion(
        self,
        context: ShortFormSuggestionContext,
    ) -> ShortFormSuggestionProviderOutput:
        provider_input = build_shortform_suggestion_input(context)
        if len(provider_input) > MAX_SHORTFORM_SUGGESTION_INPUT_CHARACTERS:
            raise LLMConfigurationError(
                "The short-form suggestion input exceeds its safe provider bound."
            )

        try:
            interaction = await self._client.aio.interactions.create(
                model=self._model,
                input=provider_input,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": gemini_response_schema(ShortFormSuggestionProviderOutput),
                },
                timeout=self._timeout_seconds,
            )
        except compat_errors.APIError as error:
            raise translate_interactions_api_error(error) from error
        except compat_errors.ResponseValidationError as error:
            raise LLMMalformedOutputError(
                "The short-form suggestion provider returned malformed output."
            ) from error
        except errors.APIError as error:
            raise translate_api_error(error) from error
        except (TimeoutError, httpx.TimeoutException) as error:
            raise LLMProviderTimeoutError(
                "The short-form suggestion provider timed out."
            ) from error
        except httpx.RequestError as error:
            raise LLMProviderUnavailableError(
                "The short-form suggestion provider is unavailable."
            ) from error

        output_text = getattr(interaction, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            raise LLMMalformedOutputError(
                "The short-form suggestion provider returned no structured output."
            )

        try:
            output = ShortFormSuggestionProviderOutput.model_validate_json(output_text)
        except ValidationError as error:
            if any(item.get("type") == "json_invalid" for item in error.errors()):
                raise LLMMalformedOutputError(
                    "The short-form suggestion provider returned malformed output."
                ) from error
            raise LLMOutputValidationError(
                "The short-form suggestion provider returned invalid structured output."
            ) from error

        allowed = {segment.index for segment in context.segments}
        if any(index not in allowed for index in output.referenced_segment_indices):
            raise LLMOutputValidationError(
                "The short-form suggestion provider referenced an unsupplied segment."
            )
        return output
