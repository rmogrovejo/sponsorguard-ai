from collections.abc import Sequence

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.domain.fixes import FixAction, FixProviderOutput
from app.domain.requirements import Requirement
from app.domain.transcript import TranscriptSegment
from app.integrations.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMMalformedOutputError,
    LLMOutputValidationError,
    LLMProviderTimeoutError,
    LLMProviderUnavailableError,
    LLMRateLimitError,
)
from app.main import create_app


ENDPOINT = "/api/v1/fixes/generate"
SRT = """1
00:00:38,000 --> 00:00:42,000
Today's video is sponsored by AcmeVPN.

2
00:00:52,000 --> 00:00:57,000
Save 25 percent with my link.

3
00:01:05,000 --> 00:01:09,000
Nobody can ever identify you online."""


class FakeGenerator:
    provider_name = "fake"
    model_name = "fake-model"

    def __init__(self, output: FixProviderOutput | Exception) -> None:
        self.output = output
        self.calls = 0

    async def generate_fix(
        self,
        requirement: Requirement,
        transcript_segments: Sequence[TranscriptSegment],
    ) -> FixProviderOutput:
        self.calls += 1
        if isinstance(self.output, Exception):
            raise self.output
        return self.output


def client(output: FixProviderOutput | Exception) -> TestClient:
    app = create_app(settings=Settings(), fix_generator=FakeGenerator(output))
    return TestClient(app, raise_server_exceptions=False)


def finding(
    requirement_id: str,
    status: str,
    reason_code: str,
    *,
    reason: str,
    index: int | None = None,
    timestamp: float | None = None,
    evidence: str | None = None,
) -> dict[str, object]:
    return {
        "requirement_id": requirement_id,
        "status": status,
        "reason_code": reason_code,
        "reason": reason,
        "source_segment_index": index,
        "timestamp_seconds": timestamp,
        "evidence": evidence,
    }


def body(requirement: dict[str, object], finding_data: dict[str, object]) -> dict[str, object]:
    return {
        "requirement": requirement,
        "finding": finding_data,
        "transcript": {"format": "srt", "content": SRT},
    }


def test_api_generates_deterministic_fix_without_provider() -> None:
    requirement = {"id": "req_coupon", "type": "required_exact_token", "description": "Use code", "value": "CREATOR25"}
    finding_data = finding(
        "req_coupon", "fail", "REQUIRED_TOKEN_MISSING", reason='Required token "CREATOR25" was not found.'
    )
    response = client(AssertionError("provider must not be called")).post(
        ENDPOINT, json=body(requirement, finding_data)
    )

    assert response.status_code == 200
    assert response.json() == {
        "requirement_id": "req_coupon",
        "action": "insert",
        "suggested_text": "Use code CREATOR25 at checkout.",
        "placement": {
            "strategy": "after_segment",
            "source_segment_index": 2,
            "timestamp_seconds": 52.0,
            "before_seconds": None,
        },
        "reason": "Insert the missing required promo code.",
    }


def test_api_generates_grounded_semantic_fix_and_preserves_request_id() -> None:
    requirement = {"id": "req_claim", "type": "forbidden_claim", "description": "Avoid claim", "value": "Do not claim users are untraceable"}
    finding_data = finding(
        "req_claim",
        "fail",
        "FORBIDDEN_CLAIM_DETECTED",
        reason="Semantic verification detected the prohibited claim.",
        index=3,
        timestamp=65.0,
        evidence="Nobody can ever identify you online.",
    )
    output = FixProviderOutput(
        action=FixAction.REPLACE,
        suggested_text="This VPN helps protect your online privacy.",
        referenced_segment_indices=(3,),
        reason="Use measured privacy language.",
    )
    response = client(output).post(
        ENDPOINT,
        json=body(requirement, finding_data),
        headers={"X-Request-ID": "fix-test-123"},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "fix-test-123"
    assert response.json()["placement"] == {
        "strategy": "replace_segment",
        "source_segment_index": 3,
        "timestamp_seconds": 65.0,
        "before_seconds": None,
    }


@pytest.mark.parametrize(
    ("status", "code"),
    [("pass", "REQUIRED_MENTION_FOUND"), ("not_evaluated", "SEMANTIC_VERIFICATION_UNAVAILABLE")],
)
def test_api_rejects_ineligible_findings(status: str, code: str) -> None:
    requirement = (
        {"id": "req_brand", "type": "required_mention", "description": "Mention brand", "value": "AcmeVPN"}
        if status == "pass"
        else {"id": "req_sem", "type": "required_talking_point", "description": "Explain benefit", "value": "Reduces editing time"}
    )
    finding_data = finding(
        requirement["id"],
        status,
        code,
        reason="Not eligible.",
        index=1 if status == "pass" else None,
        timestamp=38.0 if status == "pass" else None,
        evidence="Today's video is sponsored by AcmeVPN." if status == "pass" else None,
    )
    response = client(LLMProviderUnavailableError("unused")).post(ENDPOINT, json=body(requirement, finding_data))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "FIX_NOT_ELIGIBLE"


@pytest.mark.parametrize(
    ("provider_error", "status_code", "api_code"),
    [
        (LLMProviderTimeoutError("secret timeout"), 504, "LLM_PROVIDER_TIMEOUT"),
        (LLMRateLimitError("secret quota"), 429, "LLM_PROVIDER_RATE_LIMITED"),
        (LLMProviderUnavailableError("secret outage"), 503, "LLM_PROVIDER_UNAVAILABLE"),
        (LLMAuthenticationError("secret auth"), 503, "LLM_PROVIDER_AUTHENTICATION_ERROR"),
        (LLMConfigurationError("secret config"), 503, "LLM_PROVIDER_CONFIGURATION_ERROR"),
        (LLMMalformedOutputError("secret malformed"), 502, "LLM_PROVIDER_OUTPUT_INVALID"),
        (LLMOutputValidationError("secret schema"), 502, "LLM_PROVIDER_OUTPUT_INVALID"),
    ],
)
def test_provider_failures_use_safe_controlled_error_envelope(provider_error: Exception, status_code: int, api_code: str) -> None:
    requirement = {"id": "req_talk", "type": "required_talking_point", "description": "Explain benefit", "value": "Reduces editing time"}
    finding_data = finding(
        "req_talk", "fail", "SEMANTIC_REQUIREMENT_MISSING", reason="The talking point was not found."
    )
    response = client(provider_error).post(ENDPOINT, json=body(requirement, finding_data))
    serialized = response.text
    assert response.status_code == status_code
    assert response.json()["error"]["code"] == api_code
    assert "secret" not in serialized
    assert type(provider_error).__name__ not in serialized


def test_unexpected_fields_and_inconsistent_finding_are_rejected() -> None:
    requirement = {"id": "req_coupon", "type": "required_exact_token", "description": "Use code", "value": "CREATOR25"}
    finding_data = finding(
        "req_coupon", "fail", "REQUIRED_TOKEN_MISSING", reason="Forged reason."
    )
    payload = body(requirement, finding_data)
    payload["unexpected"] = True
    response = client(LLMProviderUnavailableError("unused")).post(ENDPOINT, json=payload)
    assert response.status_code == 422
    del payload["unexpected"]
    response = client(LLMProviderUnavailableError("unused")).post(ENDPOINT, json=payload)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_FIX_INPUT"


def test_provider_error_preserves_request_id_without_leaking_details() -> None:
    requirement = {
        "id": "req_talk",
        "type": "required_talking_point",
        "description": "Explain benefit",
        "value": "Reduces editing time",
    }
    finding_data = finding(
        "req_talk", "fail", "SEMANTIC_REQUIREMENT_MISSING", reason="The talking point was not found."
    )
    response = client(LLMProviderTimeoutError("secret timeout")).post(
        ENDPOINT,
        json=body(requirement, finding_data),
        headers={"X-Request-ID": "fix-error-123"},
    )

    assert response.status_code == 504
    assert response.headers["X-Request-ID"] == "fix-error-123"
    assert "secret" not in response.text


def test_openapi_exposes_the_versioned_fix_generation_route() -> None:
    response = TestClient(create_app(settings=Settings())).get("/openapi.json")
    paths = response.json()["paths"]
    assert ENDPOINT in paths
    assert "post" in paths[ENDPOINT]


def test_compliance_analysis_does_not_invoke_fix_generation() -> None:
    provider = FakeGenerator(AssertionError("fix generator must not run during analysis"))
    test_client = TestClient(
        create_app(settings=Settings(), fix_generator=provider),
        raise_server_exceptions=False,
    )

    response = test_client.post(
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
            "transcript": {"format": "srt", "content": SRT},
        },
    )

    assert response.status_code == 200
    assert provider.calls == 0
    assert response.json()["results"][0]["status"] == "pass"
