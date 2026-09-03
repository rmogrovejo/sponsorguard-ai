from collections.abc import Sequence
from math import isfinite
from typing import Protocol, cast

import httpx
from google import genai
from google.genai import errors, types
from google.genai._gaos.lib import compat_errors
from pydantic import ValidationError

from app.domain.semantic import SemanticRequirement, SemanticVerificationOutput
from app.domain.transcript import TranscriptSegment
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
from app.integrations.llm.semantic_prompts import (
    MAX_SEMANTIC_PROVIDER_INPUT_CHARACTERS,
    build_semantic_verification_input,
)


class _AsyncInteractionsAPI(Protocol):
    async def create(self, **kwargs: object) -> object: ...


class _AsyncGeminiAPI(Protocol):
    interactions: _AsyncInteractionsAPI


class _GeminiClient(Protocol):
    aio: _AsyncGeminiAPI


class GeminiSemanticVerifier:
    """Gemini adapter for one bounded, index-grounded semantic check."""

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

    async def verify_semantics(
        self,
        requirement: SemanticRequirement,
        transcript_segments: Sequence[TranscriptSegment],
    ) -> SemanticVerificationOutput:
        supplied_indices = [segment.index for segment in transcript_segments]
        if not supplied_indices or len(set(supplied_indices)) != len(supplied_indices):
            raise ValueError(
                "semantic provider chunks require unique source segment indices"
            )

        provider_input = build_semantic_verification_input(
            requirement,
            transcript_segments,
        )
        if len(provider_input) > MAX_SEMANTIC_PROVIDER_INPUT_CHARACTERS:
            raise LLMConfigurationError(
                "The semantic verification input exceeds its safe provider bound."
            )

        try:
            interaction = await self._client.aio.interactions.create(
                model=self._model,
                input=provider_input,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": gemini_response_schema(SemanticVerificationOutput),
                },
                timeout=self._timeout_seconds,
            )
        except compat_errors.APIError as error:
            raise translate_interactions_api_error(error) from error
        except compat_errors.ResponseValidationError as error:
            raise LLMMalformedOutputError(
                "The semantic verification provider returned malformed output."
            ) from error
        except errors.APIError as error:
            raise translate_api_error(error) from error
        except (TimeoutError, httpx.TimeoutException) as error:
            raise LLMProviderTimeoutError(
                "The semantic verification provider timed out."
            ) from error
        except httpx.RequestError as error:
            raise LLMProviderUnavailableError(
                "The semantic verification provider is unavailable."
            ) from error

        output_text = getattr(interaction, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            raise LLMMalformedOutputError(
                "The semantic verification provider returned no structured output."
            )

        try:
            output = SemanticVerificationOutput.model_validate_json(output_text)
        except ValidationError as error:
            if any(item.get("type") == "json_invalid" for item in error.errors()):
                raise LLMMalformedOutputError(
                    "The semantic verification provider returned malformed output."
                ) from error
            raise LLMOutputValidationError(
                "The semantic verification provider returned invalid structured output."
            ) from error

        allowed_indices = set(supplied_indices)
        if any(index not in allowed_indices for index in output.segment_indices):
            raise LLMOutputValidationError(
                "The semantic verification provider referenced an unsupplied segment."
            )
        return output
