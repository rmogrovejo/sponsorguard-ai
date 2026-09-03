import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from google.genai import errors
from google.genai._gaos.lib import compat_errors

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
from app.integrations.llm.gemini_provider import GeminiRequirementExtractor
from app.integrations.llm.prompts import BRIEF_EXTRACTION_INSTRUCTIONS
from app.main import create_app


VALID_OUTPUT = {
    "requirements": [
        {
            "type": "required_exact_token",
            "description": "Use the exact promo code",
            "value": "CREATOR25",
            "before_seconds": None,
            "source_text": "Use code CREATOR25.",
        }
    ]
}


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


def make_provider(interactions: FakeInteractions) -> GeminiRequirementExtractor:
    return GeminiRequirementExtractor(
        api_key="test-placeholder-not-a-real-key",
        model="gemini-3.7-flash",
        timeout_seconds=7,
        client=FakeGeminiClient(interactions),
    )


def api_error(code: int, status: str, private_message: str) -> errors.APIError:
    error_type = errors.ServerError if code >= 500 else errors.ClientError
    return error_type(
        code,
        {
            "error": {
                "code": code,
                "status": status,
                "message": private_message,
            }
        },
    )


def interactions_api_error(
    error_type: type[compat_errors.APIStatusError],
    status_code: int,
    private_message: str,
) -> compat_errors.APIStatusError:
    request = httpx.Request("POST", "https://example.invalid")
    response = httpx.Response(status_code, request=request)
    return error_type(
        private_message,
        response=response,
        body={"private": "provider details"},
    )


def test_valid_gemini_output_uses_interactions_structured_schema() -> None:
    interactions = FakeInteractions(output_text=json.dumps(VALID_OUTPUT))
    provider = make_provider(interactions)

    result = asyncio.run(
        provider.extract_structured_requirements("Use code CREATOR25.")
    )

    assert result.requirements[0].value == "CREATOR25"
    assert interactions.arguments["model"] == "gemini-3.7-flash"
    assert interactions.arguments["timeout"] == 7
    assert BRIEF_EXTRACTION_INSTRUCTIONS in str(interactions.arguments["input"])
    assert "Use code CREATOR25." in str(interactions.arguments["input"])
    response_format = interactions.arguments["response_format"]
    assert isinstance(response_format, dict)
    assert response_format["type"] == "text"
    assert response_format["mime_type"] == "application/json"
    assert isinstance(response_format["schema"], dict)
    assert "required_url" in response_format["schema"]["$defs"]["RequirementType"][
        "enum"
    ]
    assert "Never invent a URL" in BRIEF_EXTRACTION_INSTRUCTIONS
    assert "never classify" in BRIEF_EXTRACTION_INSTRUCTIONS
    domain_schema = BriefExtractionOutput.model_json_schema()
    assert domain_schema["properties"]["requirements"]["maxItems"] == 50
    assert "maxItems" not in response_format["schema"]["properties"]["requirements"]


def test_malformed_gemini_output_is_rejected_without_prose_parsing() -> None:
    provider = make_provider(FakeInteractions(output_text="Use code CREATOR25."))

    with pytest.raises(LLMMalformedOutputError):
        asyncio.run(provider.extract_structured_requirements("A brief"))


def test_unknown_rule_type_is_rejected_by_shared_pydantic_schema() -> None:
    output = {
        "requirements": [
            {
                **VALID_OUTPUT["requirements"][0],
                "type": "semantic_claim",
            }
        ]
    }
    provider = make_provider(FakeInteractions(output_text=json.dumps(output)))

    with pytest.raises(LLMOutputValidationError):
        asyncio.run(provider.extract_structured_requirements("A brief"))


def test_timeout_is_mapped_to_provider_neutral_error() -> None:
    request = httpx.Request("POST", "https://example.invalid")
    provider = make_provider(
        FakeInteractions(error=httpx.ReadTimeout("private timeout", request=request))
    )

    with pytest.raises(LLMProviderTimeoutError, match="provider timed out"):
        asyncio.run(provider.extract_structured_requirements("A brief"))


@pytest.mark.parametrize(
    ("sdk_error", "expected_type"),
    [
        (
            compat_errors.APITimeoutError(
                httpx.Request("POST", "https://example.invalid")
            ),
            LLMProviderTimeoutError,
        ),
        (
            compat_errors.APIConnectionError(
                request=httpx.Request("POST", "https://example.invalid")
            ),
            LLMProviderUnavailableError,
        ),
    ],
)
def test_interactions_transport_errors_map_to_provider_neutral_errors(
    sdk_error: compat_errors.APIError,
    expected_type: type[Exception],
) -> None:
    provider = make_provider(FakeInteractions(error=sdk_error))

    with pytest.raises(expected_type):
        asyncio.run(provider.extract_structured_requirements("A brief"))


def test_interactions_response_validation_error_maps_to_malformed_output() -> None:
    request = httpx.Request("POST", "https://example.invalid")
    response = httpx.Response(200, request=request)
    sdk_error = compat_errors.ResponseValidationError(
        "private response details",
        response,
        ValueError("private parsing details"),
        body="private provider body",
    )
    provider = make_provider(FakeInteractions(error=sdk_error))

    with pytest.raises(LLMMalformedOutputError) as captured:
        asyncio.run(provider.extract_structured_requirements("A brief"))

    assert "private" not in str(captured.value)


@pytest.mark.parametrize(
    ("sdk_error", "expected_type"),
    [
        (
            api_error(429, "RESOURCE_EXHAUSTED", "private quota details"),
            LLMRateLimitError,
        ),
        (
            api_error(503, "UNAVAILABLE", "private upstream details"),
            LLMProviderUnavailableError,
        ),
        (
            api_error(401, "UNAUTHENTICATED", "private key details"),
            LLMAuthenticationError,
        ),
        (
            api_error(400, "INVALID_ARGUMENT", "private model details"),
            LLMConfigurationError,
        ),
    ],
)
def test_gemini_api_errors_map_without_leaking_sdk_details(
    sdk_error: errors.APIError,
    expected_type: type[Exception],
) -> None:
    provider = make_provider(FakeInteractions(error=sdk_error))

    with pytest.raises(expected_type) as captured:
        asyncio.run(provider.extract_structured_requirements("A brief"))

    public_exception = str(captured.value)
    assert "private" not in public_exception
    assert "ClientError" not in public_exception
    assert "ServerError" not in public_exception


@pytest.mark.parametrize(
    ("sdk_error", "expected_type"),
    [
        (
            interactions_api_error(
                compat_errors.RateLimitError,
                429,
                "private quota details",
            ),
            LLMRateLimitError,
        ),
        (
            interactions_api_error(
                compat_errors.InternalServerError,
                503,
                "private upstream details",
            ),
            LLMProviderUnavailableError,
        ),
        (
            interactions_api_error(
                compat_errors.AuthenticationError,
                401,
                "private key details",
            ),
            LLMAuthenticationError,
        ),
        (
            interactions_api_error(
                compat_errors.BadRequestError,
                400,
                "private schema details",
            ),
            LLMConfigurationError,
        ),
    ],
)
def test_interactions_api_errors_map_without_leaking_sdk_details(
    sdk_error: compat_errors.APIStatusError,
    expected_type: type[Exception],
) -> None:
    provider = make_provider(FakeInteractions(error=sdk_error))

    with pytest.raises(expected_type) as captured:
        asyncio.run(provider.extract_structured_requirements("A brief"))

    assert "private" not in str(captured.value)
    assert type(sdk_error).__name__ not in str(captured.value)


def test_interactions_bad_request_is_controlled_at_http_boundary() -> None:
    provider = make_provider(
        FakeInteractions(
            error=interactions_api_error(
                compat_errors.BadRequestError,
                400,
                "private invalid request details",
            )
        )
    )
    client = TestClient(
        create_app(requirement_extractor=provider),
        raise_server_exceptions=False,
    )

    response = client.post(
        "/api/v1/briefs/extract",
        json={"brief": "Mention AcmeVPN."},
    )

    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "LLM_PROVIDER_CONFIGURATION_ERROR",
        "message": "Requirement extraction is not configured on this server.",
        "details": {"reason_code": "configuration"},
    }
    assert "private" not in response.text


def test_existing_extraction_endpoint_accepts_gemini_provider_boundary() -> None:
    provider = make_provider(FakeInteractions(output_text=json.dumps(VALID_OUTPUT)))
    client = TestClient(
        create_app(requirement_extractor=provider),
        raise_server_exceptions=False,
    )

    response = client.post(
        "/api/v1/briefs/extract",
        json={"brief": "Use code CREATOR25."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requirements"][0]["value"] == "CREATOR25"
    assert body["meta"] == {
        "provider": "gemini",
        "model": "gemini-3.7-flash",
        "prompt_version": "1.1",
        "requirement_count": 1,
    }


def test_gemini_unavailable_keeps_manual_compliance_workflow_usable() -> None:
    provider = make_provider(
        FakeInteractions(
            error=api_error(503, "UNAVAILABLE", "private upstream details")
        )
    )
    client = TestClient(
        create_app(requirement_extractor=provider),
        raise_server_exceptions=False,
    )

    extraction_response = client.post(
        "/api/v1/briefs/extract",
        json={"brief": "Mention AcmeVPN."},
    )
    compliance_response = client.post(
        "/api/v1/compliance/analyze",
        json={
            "requirements": [
                {
                    "id": "req_brand",
                    "type": "required_mention",
                    "description": "Mention AcmeVPN",
                    "value": "AcmeVPN",
                }
            ],
            "transcript": {
                "format": "srt",
                "content": "1\n00:00:01,000 --> 00:00:02,000\nAcmeVPN.",
            },
        },
    )

    assert extraction_response.status_code == 503
    assert extraction_response.json()["error"]["code"] == "LLM_PROVIDER_UNAVAILABLE"
    assert "private" not in extraction_response.text
    assert compliance_response.status_code == 200
    assert compliance_response.json()["results"][0]["status"] == "pass"
