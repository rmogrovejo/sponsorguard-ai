from fastapi.testclient import TestClient

from app.core.config import Settings
from app.integrations.llm.exceptions import LLMConfigurationError
from app.main import create_app
from tests.test_api_briefs import StubProvider


def _extract_client(limit: int = 2) -> TestClient:
    settings = Settings(rate_limit_expensive_per_minute=limit)
    app = create_app(
        settings=settings,
        requirement_extractor=StubProvider(),
    )
    return TestClient(app, raise_server_exceptions=False)


def test_expensive_endpoint_returns_controlled_429() -> None:
    client = _extract_client(limit=2)
    payload = {"brief": "Mention AcmeVPN and use code CREATOR25."}
    first = client.post("/api/v1/briefs/extract", json=payload)
    second = client.post("/api/v1/briefs/extract", json=payload)
    third = client.post(
        "/api/v1/briefs/extract",
        json=payload,
        headers={"X-Request-ID": "rate-limit-demo"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429
    assert third.json()["error"]["code"] == "RATE_LIMITED"
    assert third.headers["X-Request-ID"] == "rate-limit-demo"
    assert third.headers["Retry-After"].isdigit()
    assert "GEMINI_API_KEY" not in third.text


def test_health_is_not_rate_limited() -> None:
    settings = Settings(rate_limit_expensive_per_minute=1, rate_limit_standard_per_minute=1)
    client = TestClient(create_app(settings=settings), raise_server_exceptions=False)
    for _ in range(6):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["service"] == "CreatorPreflight API"


def test_unconfigured_provider_still_degrades_after_rate_limit_window_config() -> None:
    client = TestClient(
        create_app(
            settings=Settings(rate_limit_expensive_per_minute=8),
            requirement_extractor=StubProvider(
                error=LLMConfigurationError(
                    "Requirement extraction is not configured on this server."
                )
            ),
        ),
        raise_server_exceptions=False,
    )
    response = client.post("/api/v1/briefs/extract", json={"brief": "Mention AcmeVPN"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "LLM_PROVIDER_CONFIGURATION_ERROR"
