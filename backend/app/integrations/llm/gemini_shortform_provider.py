from __future__ import annotations

import base64
from math import isfinite
from typing import Protocol, cast

import httpx
from google import genai
from google.genai import errors, types
from google.genai._gaos.lib import compat_errors
from pydantic import ValidationError

from app.domain.shortform_speech import ShortFormProviderDocument
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
from app.integrations.llm.shortform_prompts import (
    MAX_SHORTFORM_PROVIDER_TEXT_CHARACTERS,
    build_shortform_semantic_input,
)
from app.integrations.llm.shortform_request import ShortFormSemanticRequest


class _AsyncInteractionsAPI(Protocol):
    async def create(self, **kwargs: object) -> object: ...


class _AsyncGeminiAPI(Protocol):
    interactions: _AsyncInteractionsAPI


class _GeminiClient(Protocol):
    aio: _AsyncGeminiAPI


class GeminiShortFormAnalyzer:
    """Gemini adapter for one bounded short-form hook and CTA review."""

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

    async def analyze_shortform(
        self,
        request: ShortFormSemanticRequest,
    ) -> ShortFormProviderDocument:
        provider_input = build_shortform_semantic_input(
            opening=request.opening,
            ending=request.ending,
            video_duration_seconds=request.video_duration_seconds,
            opening_speech_text=request.opening_speech_text,
            ending_speech_text=request.ending_speech_text,
        )
        if len(provider_input) > MAX_SHORTFORM_PROVIDER_TEXT_CHARACTERS:
            raise LLMConfigurationError(
                "The short-form semantic input exceeds its safe provider bound."
            )

        interaction_input: list[dict[str, object]] = [
            {"type": "text", "text": provider_input}
        ]
        if request.opening_audio:
            interaction_input.append(_audio_part(request.opening_audio))
        if request.ending_audio:
            interaction_input.append(_audio_part(request.ending_audio))

        try:
            interaction = await self._client.aio.interactions.create(
                model=self._model,
                input=interaction_input,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": gemini_response_schema(ShortFormProviderDocument),
                },
                timeout=self._timeout_seconds,
            )
        except compat_errors.APIError as error:
            raise translate_interactions_api_error(error) from error
        except compat_errors.ResponseValidationError as error:
            raise LLMMalformedOutputError(
                "The short-form provider returned malformed output."
            ) from error
        except errors.APIError as error:
            raise translate_api_error(error) from error
        except (TimeoutError, httpx.TimeoutException) as error:
            raise LLMProviderTimeoutError(
                "The short-form provider timed out."
            ) from error
        except httpx.RequestError as error:
            raise LLMProviderUnavailableError(
                "The short-form provider is unavailable."
            ) from error

        output_text = getattr(interaction, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            raise LLMMalformedOutputError(
                "The short-form provider returned no structured output."
            )

        try:
            document = ShortFormProviderDocument.model_validate_json(output_text)
        except ValidationError as error:
            if any(item.get("type") == "json_invalid" for item in error.errors()):
                raise LLMMalformedOutputError(
                    "The short-form provider returned malformed output."
                ) from error
            raise LLMOutputValidationError(
                "The short-form provider returned invalid structured output."
            ) from error

        supplied = {segment.index for segment in document.segments}
        cited = set(document.hook.segment_indices) | set(document.cta.segment_indices)
        if any(index not in supplied for index in cited):
            raise LLMOutputValidationError(
                "The short-form provider referenced an unsupplied segment."
            )
        return document


def _audio_part(wav_bytes: bytes) -> dict[str, object]:
    return {
        "type": "audio",
        "mime_type": "audio/wav",
        "data": base64.b64encode(wav_bytes).decode("ascii"),
    }
