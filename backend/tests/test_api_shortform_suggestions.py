from fastapi.testclient import TestClient

from app.core.config import Settings
from app.domain.shortform_suggestions import SuggestionOutcome
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
from tests.shortform_suggestion_fixtures import (
    FakeSuggestionGenerator,
    provider_output,
)


ENDPOINT = "/api/v1/shortform/suggestions/generate"


def client(generator: FakeSuggestionGenerator) -> TestClient:
    return TestClient(
        create_app(
            settings=Settings(),
            shortform_suggestion_generator=generator,
        ),
        raise_server_exceptions=False,
    )


def opening_body() -> dict[str, object]:
    return {
        "finding_id": "opening",
        "platform": "tiktok",
        "video_duration_seconds": 30.0,
        "finding": {
            "check_id": "opening",
            "category": "opening",
            "status": "warning",
            "title": "Opening",
            "reason": "The viewer payoff arrives after a generic introduction.",
            "recommendation": "Establish the viewer-facing subject earlier.",
            "evidence_text": "Hey guys, welcome back to another video. Today I'm going to show you three settings.",
            "ranges": [{"start_seconds": 0.0, "end_seconds": 3.2, "duration_seconds": 3.2}],
            "measurements": {"hook_decision": "review"},
        },
        "speech_segments": [
            {
                "index": 1,
                "start_seconds": 0.0,
                "end_seconds": 3.2,
                "text": "Hey guys, welcome back to another video. Today I'm going to show you three settings that are slowing down your PC.",
            },
            {
                "index": 2,
                "start_seconds": 24.0,
                "end_seconds": 26.0,
                "text": "And that's the third setting.",
            },
        ],
    }


def cta_body() -> dict[str, object]:
    return {
        "finding_id": "cta",
        "platform": "instagram_reels",
        "video_duration_seconds": 30.0,
        "finding": {
            "check_id": "cta",
            "category": "cta",
            "status": "warning",
            "title": "Call to action",
            "reason": "No clear call to action detected near the ending.",
            "recommendation": "Consider giving the viewer an explicit next step.",
            "evidence_text": None,
            "ranges": [],
            "measurements": {"cta_decision": "not_found"},
        },
        "speech_segments": [
            {
                "index": 1,
                "start_seconds": 0.2,
                "end_seconds": 3.0,
                "text": "Hey guys, welcome back to another video.",
            },
            {
                "index": 2,
                "start_seconds": 24.1,
                "end_seconds": 26.4,
                "text": "And that's the third setting.",
            },
        ],
    }


def test_opening_endpoint_success() -> None:
    generator = FakeSuggestionGenerator(provider_output())
    response = client(generator).post(
        ENDPOINT,
        json=opening_body(),
        headers={"X-Request-ID": "suggest-opening-1"},
    )
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "suggest-opening-1"
    body = response.json()
    assert body["finding_id"] == "opening"
    assert body["type"] == "opening"
    assert body["outcome"] == SuggestionOutcome.SUGGESTED
    assert body["display_label"] == "SUGGESTED OPENING"
    assert body["placement"]["strategy"] == "replace_opening"
    assert body["placement"]["start_seconds"] == 0.0
    assert body["placement"]["end_seconds"] == 3.2
    assert generator.calls == 1


def test_cta_endpoint_success() -> None:
    generator = FakeSuggestionGenerator(
        provider_output(
            text="Follow for part two.",
            reason="The ending has no clear next action.",
            indices=(2,),
        )
    )
    response = client(generator).post(
        ENDPOINT,
        json=cta_body(),
        headers={"X-Request-ID": "suggest-cta-1"},
    )
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "suggest-cta-1"
    body = response.json()
    assert body["finding_id"] == "cta"
    assert body["suggested_text"] == "Follow for part two."
    assert body["placement"]["strategy"] == "append_near_end"
    assert body["placement"]["after_seconds"] == 26.4


def test_ineligible_request_is_rejected() -> None:
    payload = opening_body()
    payload["finding"]["status"] = "pass"  # type: ignore[index]
    generator = FakeSuggestionGenerator(provider_output())
    response = client(generator).post(ENDPOINT, json=payload)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "SUGGESTION_NOT_ELIGIBLE"
    assert generator.calls == 0


def test_request_id_is_preserved_on_provider_failure() -> None:
    generator = FakeSuggestionGenerator(LLMProviderTimeoutError("late"))
    response = client(generator).post(
        ENDPOINT,
        json=opening_body(),
        headers={"X-Request-ID": "suggest-timeout-1"},
    )
    assert response.status_code == 504
    assert response.headers["X-Request-ID"] == "suggest-timeout-1"
    assert response.json()["error"]["code"] == "LLM_PROVIDER_TIMEOUT"
    assert "Gemini" not in response.text
    assert "secret" not in response.text


def test_safe_provider_failures_do_not_leak_internals() -> None:
    cases = (
        (LLMProviderTimeoutError("late secret"), 504, "LLM_PROVIDER_TIMEOUT"),
        (LLMRateLimitError("quota secret"), 429, "LLM_PROVIDER_RATE_LIMITED"),
        (LLMProviderUnavailableError("down secret"), 503, "LLM_PROVIDER_UNAVAILABLE"),
        (LLMMalformedOutputError("bad json secret"), 502, "LLM_PROVIDER_OUTPUT_INVALID"),
        (LLMOutputValidationError("schema secret"), 502, "LLM_PROVIDER_OUTPUT_INVALID"),
        (LLMConfigurationError("missing key secret"), 503, "LLM_PROVIDER_CONFIGURATION_ERROR"),
        (LLMAuthenticationError("auth secret"), 503, "LLM_PROVIDER_AUTHENTICATION_ERROR"),
    )
    for error, status_code, code in cases:
        response = client(FakeSuggestionGenerator(error)).post(ENDPOINT, json=opening_body())
        assert response.status_code == status_code
        body = response.json()
        assert body["error"]["code"] == code
        assert "Gemini" not in response.text
        assert "secret" not in response.text
        assert "Suggestion generation" in body["error"]["message"]


def test_openapi_exposes_suggestion_route() -> None:
    paths = client(FakeSuggestionGenerator(provider_output())).get("/openapi.json").json()["paths"]
    assert ENDPOINT in paths
    assert "post" in paths[ENDPOINT]
