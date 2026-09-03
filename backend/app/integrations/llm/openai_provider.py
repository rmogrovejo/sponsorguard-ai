from math import isfinite
from typing import Protocol, cast

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    RateLimitError,
)
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
from app.integrations.llm.prompts import BRIEF_EXTRACTION_INSTRUCTIONS


class _ResponsesAPI(Protocol):
    async def create(self, **kwargs: object) -> object: ...


class _OpenAIClient(Protocol):
    responses: _ResponsesAPI


class OpenAIRequirementExtractor:
    """OpenAI-specific structured extraction isolated behind the app protocol."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float,
        client: _OpenAIClient | None = None,
    ) -> None:
        if not api_key.strip():
            raise LLMConfigurationError("The language-model provider is not configured.")
        if not model.strip():
            raise LLMConfigurationError("The language-model model is not configured.")
        if not isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise LLMConfigurationError("The language-model timeout is invalid.")

        self._model = model.strip()
        self._client = client or cast(
            _OpenAIClient,
            AsyncOpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=0),
        )

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    async def extract_structured_requirements(
        self,
        brief: str,
    ) -> BriefExtractionOutput:
        try:
            response = await self._client.responses.create(
                model=self._model,
                instructions=BRIEF_EXTRACTION_INSTRUCTIONS,
                input=brief,
                store=False,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "sponsorguard_brief_requirements",
                        "schema": BriefExtractionOutput.model_json_schema(),
                        "strict": True,
                    }
                },
            )
        except APITimeoutError as error:
            raise LLMProviderTimeoutError(
                "The requirement extraction provider timed out."
            ) from error
        except RateLimitError as error:
            raise LLMRateLimitError(
                "The requirement extraction provider is rate limited."
            ) from error
        except AuthenticationError as error:
            raise LLMAuthenticationError(
                "The requirement extraction provider could not authenticate."
            ) from error
        except APIConnectionError as error:
            raise LLMProviderUnavailableError(
                "The requirement extraction provider is unavailable."
            ) from error
        except APIStatusError as error:
            if error.status_code >= 500:
                raise LLMProviderUnavailableError(
                    "The requirement extraction provider is unavailable."
                ) from error
            raise LLMConfigurationError(
                "The requirement extraction provider rejected its configuration."
            ) from error

        output_text = getattr(response, "output_text", None)
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
