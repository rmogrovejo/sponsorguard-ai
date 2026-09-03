import json
import re

import pytest
from fastapi.testclient import TestClient

from app.domain.extraction import BriefExtractionOutput, BriefRequirementCandidate
from app.domain.requirements import RequirementType
from app.integrations.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMMalformedOutputError,
    LLMProviderTimeoutError,
    LLMProviderUnavailableError,
    LLMRateLimitError,
)
from app.main import create_app
from app.services.brief_extraction import MAX_BRIEF_CHARACTERS


ENDPOINT = "/api/v1/briefs/extract"
REQUEST_ID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)


def extracted_output() -> BriefExtractionOutput:
    return BriefExtractionOutput(
        requirements=(
            BriefRequirementCandidate(
                type=RequirementType.REQUIRED_MENTION_BEFORE,
                description="Mention AcmeVPN in the first minute",
                value="AcmeVPN",
                before_seconds=60,
                source_text="Mention AcmeVPN in the first 60 seconds.",
            ),
            BriefRequirementCandidate(
                type=RequirementType.REQUIRED_EXACT_TOKEN,
                description="Use the exact promo code",
                value="CREATOR25",
                before_seconds=None,
                source_text="Use code CREATOR25.",
            ),
            BriefRequirementCandidate(
                type=RequirementType.FORBIDDEN_PHRASE,
                description="Do not guarantee anonymity",
                value="guaranteed anonymity",
                before_seconds=None,
                source_text="Do not claim guaranteed anonymity.",
            ),
        )
    )


class StubProvider:
    provider_name = "stub-provider"
    model_name = "stub-model"

    def __init__(
        self,
        result: BriefExtractionOutput | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result or extracted_output()
        self.error = error
        self.calls = 0
        self.received_brief: str | None = None

    async def extract_structured_requirements(
        self,
        brief: str,
    ) -> BriefExtractionOutput:
        self.calls += 1
        self.received_brief = brief
        if self.error is not None:
            raise self.error
        return self.result


def make_client(provider: StubProvider) -> TestClient:
    return TestClient(
        create_app(requirement_extractor=provider),
        raise_server_exceptions=False,
    )


def assert_error(response: object, status_code: int, code: str) -> dict[str, object]:
    assert hasattr(response, "status_code")
    assert response.status_code == status_code  # type: ignore[union-attr]
    body = response.json()  # type: ignore[union-attr]
    assert body["error"]["code"] == code
    return body


def test_valid_brief_returns_typed_requirements_with_provenance_and_meta() -> None:
    provider = StubProvider()
    client = make_client(provider)

    response = client.post(
        ENDPOINT,
        json={"brief": "Mention AcmeVPN in the first 60 seconds."},
    )

    assert response.status_code == 200
    body = response.json()
    assert provider.calls == 1
    assert [item["type"] for item in body["requirements"]] == [
        "required_mention_before",
        "required_exact_token",
        "forbidden_phrase",
    ]
    assert body["requirements"][0] == {
        "id": body["requirements"][0]["id"],
        "type": "required_mention_before",
        "description": "Mention AcmeVPN in the first minute",
        "value": "AcmeVPN",
        "before_seconds": 60.0,
        "source_text": "Mention AcmeVPN in the first 60 seconds.",
    }
    assert body["requirements"][1]["value"] == "CREATOR25"
    assert body["meta"] == {
        "provider": "stub-provider",
        "model": "stub-model",
        "prompt_version": "1.1",
        "requirement_count": 3,
    }
    assert all(item["id"].startswith("req_ai_") for item in body["requirements"])
    assert len({item["id"] for item in body["requirements"]}) == 3


@pytest.mark.parametrize("brief", ["", "   \n\t"])
def test_empty_brief_is_rejected_before_provider(brief: str) -> None:
    provider = StubProvider()
    response = make_client(provider).post(ENDPOINT, json={"brief": brief})

    assert_error(response, 422, "REQUEST_VALIDATION_ERROR")
    assert provider.calls == 0


def test_oversized_brief_returns_413_before_provider() -> None:
    provider = StubProvider()
    response = make_client(provider).post(
        ENDPOINT,
        json={"brief": "x" * (MAX_BRIEF_CHARACTERS + 1)},
    )

    body = assert_error(response, 413, "BRIEF_TOO_LARGE")
    assert body["error"]["details"] == {
        "max_characters": MAX_BRIEF_CHARACTERS
    }
    assert provider.calls == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"brief": 42},
        {"brief": "Mention AcmeVPN.", "unexpected": True},
    ],
)
def test_malformed_requests_use_safe_validation_envelope(
    payload: dict[str, object],
) -> None:
    response = make_client(StubProvider()).post(ENDPOINT, json=payload)

    body = assert_error(response, 422, "REQUEST_VALIDATION_ERROR")
    assert set(body) == {"error"}
    assert "issues" in body["error"]["details"]


@pytest.mark.parametrize(
    ("provider_error", "status_code", "api_code"),
    [
        (
            LLMProviderTimeoutError("private provider timeout details"),
            504,
            "LLM_PROVIDER_TIMEOUT",
        ),
        (
            LLMProviderUnavailableError("private host"),
            503,
            "LLM_PROVIDER_UNAVAILABLE",
        ),
        (
            LLMRateLimitError("private quota"),
            429,
            "LLM_PROVIDER_RATE_LIMITED",
        ),
        (
            LLMAuthenticationError("sk-secret-value"),
            503,
            "LLM_PROVIDER_AUTHENTICATION_ERROR",
        ),
        (
            LLMConfigurationError("OPENAI_API_KEY=sk-secret-value"),
            503,
            "LLM_PROVIDER_CONFIGURATION_ERROR",
        ),
        (
            LLMMalformedOutputError("private raw response"),
            502,
            "LLM_PROVIDER_OUTPUT_INVALID",
        ),
    ],
)
def test_provider_failures_use_controlled_safe_error_envelope(
    provider_error: Exception,
    status_code: int,
    api_code: str,
) -> None:
    provider = StubProvider(error=provider_error)
    response = make_client(provider).post(ENDPOINT, json={"brief": "A safe brief."})

    body = assert_error(response, status_code, api_code)
    serialized = json.dumps(body)
    assert "private" not in serialized
    assert "sk-secret-value" not in serialized
    assert provider_error.__class__.__name__ not in serialized


def test_request_id_is_preserved_on_extraction_response() -> None:
    request_id = "brief-review:campaign-42"

    response = make_client(StubProvider()).post(
        ENDPOINT,
        json={"brief": "Mention AcmeVPN."},
        headers={"X-Request-ID": request_id},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == request_id


def test_extraction_endpoint_serializes_required_url_with_provenance() -> None:
    provider = StubProvider(
        result=BriefExtractionOutput(
            requirements=(
                BriefRequirementCandidate(
                    type=RequirementType.REQUIRED_URL,
                    description="Mention the campaign URL",
                    value="https://www.acmevpn.com/creator/",
                    before_seconds=None,
                    source_text="Tell viewers to visit acmevpn.com/creator.",
                ),
            )
        )
    )

    response = make_client(provider).post(
        ENDPOINT,
        json={"brief": "Tell viewers to visit acmevpn.com/creator."},
    )

    assert response.status_code == 200
    requirement = response.json()["requirements"][0]
    assert requirement["type"] == "required_url"
    assert requirement["value"] == "acmevpn.com/creator"
    assert requirement["source_text"] == "Tell viewers to visit acmevpn.com/creator."


def test_invalid_request_id_is_replaced_on_provider_error() -> None:
    provider = StubProvider(error=LLMProviderTimeoutError("timeout"))

    response = make_client(provider).post(
        ENDPOINT,
        json={"brief": "Mention AcmeVPN."},
        headers={"X-Request-ID": "invalid request id"},
    )

    assert response.status_code == 504
    assert REQUEST_ID_PATTERN.fullmatch(response.headers["X-Request-ID"])


def test_default_unconfigured_provider_does_not_break_manual_compliance_api() -> None:
    client = TestClient(create_app(), raise_server_exceptions=False)
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
    extraction_response = client.post(ENDPOINT, json={"brief": "Mention AcmeVPN."})

    assert compliance_response.status_code == 200
    assert compliance_response.json()["results"][0]["status"] == "pass"
    assert_error(
        extraction_response,
        503,
        "LLM_PROVIDER_CONFIGURATION_ERROR",
    )
