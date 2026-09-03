from google.genai import errors
from google.genai._gaos.lib import compat_errors
from pydantic import BaseModel

from app.integrations.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMMalformedOutputError,
    LLMProviderError,
    LLMProviderTimeoutError,
    LLMProviderUnavailableError,
    LLMRateLimitError,
)


def gemini_response_schema(model: type[BaseModel]) -> dict[str, object]:
    """Adapt Gemini transport limits without weakening Pydantic validation."""

    adapted = _remove_schema_keyword(model.model_json_schema(), keyword="maxItems")
    assert isinstance(adapted, dict)
    return adapted


def translate_api_error(error: errors.APIError) -> LLMProviderError:
    code = error.code
    status = (error.status or "").upper()

    if code == 429 or status == "RESOURCE_EXHAUSTED":
        return LLMRateLimitError("The language-model provider is rate limited.")
    if code in {408, 499, 504} or status in {"CANCELLED", "DEADLINE_EXCEEDED"}:
        return LLMProviderTimeoutError("The language-model provider timed out.")
    if code in {401, 403} or status in {"UNAUTHENTICATED", "PERMISSION_DENIED"}:
        return LLMAuthenticationError(
            "The language-model provider could not authenticate."
        )
    if 500 <= code < 600:
        return LLMProviderUnavailableError(
            "The language-model provider is unavailable."
        )
    if 400 <= code < 500:
        return LLMConfigurationError(
            "The language-model provider rejected its configuration."
        )
    return LLMProviderUnavailableError("The language-model provider is unavailable.")


def translate_interactions_api_error(
    error: compat_errors.APIError,
) -> LLMProviderError:
    if isinstance(error, compat_errors.APITimeoutError):
        return LLMProviderTimeoutError("The language-model provider timed out.")
    if isinstance(error, compat_errors.APIConnectionError):
        return LLMProviderUnavailableError(
            "The language-model provider is unavailable."
        )
    if isinstance(error, compat_errors.APIResponseValidationError):
        return LLMMalformedOutputError(
            "The language-model provider returned malformed output."
        )

    status_code = error.status_code
    if status_code == 429:
        return LLMRateLimitError("The language-model provider is rate limited.")
    if status_code in {408, 499, 504}:
        return LLMProviderTimeoutError("The language-model provider timed out.")
    if status_code in {401, 403}:
        return LLMAuthenticationError(
            "The language-model provider could not authenticate."
        )
    if status_code is not None and 500 <= status_code < 600:
        return LLMProviderUnavailableError(
            "The language-model provider is unavailable."
        )
    if status_code is not None and 400 <= status_code < 500:
        return LLMConfigurationError(
            "The language-model provider rejected its configuration."
        )
    return LLMProviderUnavailableError("The language-model provider is unavailable.")


def _remove_schema_keyword(value: object, *, keyword: str) -> object:
    if isinstance(value, dict):
        return {
            key: _remove_schema_keyword(item, keyword=keyword)
            for key, item in value.items()
            if key != keyword
        }
    if isinstance(value, list):
        return [_remove_schema_keyword(item, keyword=keyword) for item in value]
    return value
