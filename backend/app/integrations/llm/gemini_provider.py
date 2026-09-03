from math import isfinite
from typing import Protocol, cast

import httpx
from google import genai
from google.genai import errors, types
from google.genai._gaos.lib import compat_errors
from pydantic import ValidationError

from app.domain.extraction import BriefExtractionOutput
from app.integrations.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMMalformedOutputError,
    LLMOutputValidationError,
    LLMProviderTimeoutError,
    LLMProviderUnavailableError,
    LLMRateLimitError,
)
from app.integrations.llm.prompts import build_brief_extraction_input


class _AsyncInteractionsAPI(Protocol):
    async def create(self, **kwargs: object) -> object: ...


class _AsyncGeminiAPI(Protocol):
    interactions: _AsyncInteractionsAPI


class _GeminiClient(Protocol):
    aio: _AsyncGeminiAPI


class GeminiRequirementExtractor:
    """Gemini Interactions API adapter for SponsorGuard requirement extraction."""

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

    async def extract_structured_requirements(
        self,
        brief: str,
    ) -> BriefExtractionOutput:
        try:
            interaction = await self._client.aio.interactions.create(
                model=self._model,
                input=build_brief_extraction_input(brief),
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": _gemini_response_schema(),
                },
                timeout=self._timeout_seconds,
            )
        # google-genai 2.22 uses a separate error hierarchy for the
        # Interactions API. It is not derived from google.genai.errors.APIError.
        except compat_errors.APIError as error:
            raise _translate_interactions_api_error(error) from error
        except compat_errors.ResponseValidationError as error:
            raise LLMMalformedOutputError(
                "The requirement extraction provider returned malformed output."
            ) from error
        except errors.APIError as error:
            raise _translate_api_error(error) from error
        except (TimeoutError, httpx.TimeoutException) as error:
            raise LLMProviderTimeoutError(
                "The requirement extraction provider timed out."
            ) from error
        except httpx.RequestError as error:
            raise LLMProviderUnavailableError(
                "The requirement extraction provider is unavailable."
            ) from error

        output_text = getattr(interaction, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            raise LLMMalformedOutputError(
                "The requirement extraction provider returned no structured output."
            )

        try:
            return BriefExtractionOutput.model_validate_json(output_text)
        except ValidationError as error:
            if any(item.get("type") == "json_invalid" for item in error.errors()):
                raise LLMMalformedOutputError(
                    "The requirement extraction provider returned malformed output."
                ) from error
            raise LLMOutputValidationError(
                "The requirement extraction provider returned invalid structured output."
            ) from error


def _translate_api_error(error: errors.APIError) -> Exception:
    code = error.code
    status = (error.status or "").upper()

    if code == 429 or status == "RESOURCE_EXHAUSTED":
        return LLMRateLimitError(
            "The requirement extraction provider is rate limited."
        )
    if code in {408, 499, 504} or status in {"CANCELLED", "DEADLINE_EXCEEDED"}:
        return LLMProviderTimeoutError(
            "The requirement extraction provider timed out."
        )
    if code in {401, 403} or status in {"UNAUTHENTICATED", "PERMISSION_DENIED"}:
        return LLMAuthenticationError(
            "The requirement extraction provider could not authenticate."
        )
    if 500 <= code < 600:
        return LLMProviderUnavailableError(
            "The requirement extraction provider is unavailable."
        )
    if 400 <= code < 500:
        return LLMConfigurationError(
            "The requirement extraction provider rejected its configuration."
        )
    return LLMProviderUnavailableError(
        "The requirement extraction provider is unavailable."
    )


def _translate_interactions_api_error(
    error: compat_errors.APIError,
) -> Exception:
    if isinstance(error, compat_errors.APITimeoutError):
        return LLMProviderTimeoutError(
            "The requirement extraction provider timed out."
        )
    if isinstance(error, compat_errors.APIConnectionError):
        return LLMProviderUnavailableError(
            "The requirement extraction provider is unavailable."
        )
    if isinstance(error, compat_errors.APIResponseValidationError):
        return LLMMalformedOutputError(
            "The requirement extraction provider returned malformed output."
        )

    status_code = error.status_code
    if status_code == 429:
        return LLMRateLimitError(
            "The requirement extraction provider is rate limited."
        )
    if status_code in {408, 499, 504}:
        return LLMProviderTimeoutError(
            "The requirement extraction provider timed out."
        )
    if status_code in {401, 403}:
        return LLMAuthenticationError(
            "The requirement extraction provider could not authenticate."
        )
    if status_code is not None and 500 <= status_code < 600:
        return LLMProviderUnavailableError(
            "The requirement extraction provider is unavailable."
        )
    if status_code is not None and 400 <= status_code < 500:
        return LLMConfigurationError(
            "The requirement extraction provider rejected its configuration."
        )
    return LLMProviderUnavailableError(
        "The requirement extraction provider is unavailable."
    )


def _gemini_response_schema() -> dict[str, object]:
    """Return Gemini's transport schema without weakening domain validation.

    Gemini 3.7 Flash currently rejects ``maxItems`` on Interactions structured
    output with INVALID_ARGUMENT. The authoritative Pydantic model still
    enforces MAX_EXTRACTED_REQUIREMENTS after the response is received.
    """

    schema = BriefExtractionOutput.model_json_schema()
    adapted = _remove_schema_keyword(schema, keyword="maxItems")
    assert isinstance(adapted, dict)
    return adapted


def _remove_schema_keyword(
    value: object,
    *,
    keyword: str,
) -> object:
    if isinstance(value, dict):
        return {
            key: _remove_schema_keyword(item, keyword=keyword)
            for key, item in value.items()
            if key != keyword
        }
    if isinstance(value, list):
        return [
            _remove_schema_keyword(item, keyword=keyword)
            for item in value
        ]
    return value
