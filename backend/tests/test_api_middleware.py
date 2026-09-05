import asyncio
import json
import re

import pytest
from fastapi.testclient import TestClient

import app.api.middleware as middleware_module
from app.core.config import Settings
from app.main import app, create_app


ENDPOINT = "/api/v1/compliance/analyze"
UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)
client = TestClient(app, raise_server_exceptions=False)


def valid_body(content: str = "AcmeVPN.") -> dict[str, object]:
    return {
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
            "content": f"1\n00:00:01,000 --> 00:00:02,000\n{content}",
        },
    }


def test_response_contains_generated_request_id() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert UUID_PATTERN.fullmatch(response.headers["X-Request-ID"])


def test_valid_caller_request_id_is_preserved() -> None:
    request_id = "creator-upload:campaign_123.4"

    response = client.post(
        ENDPOINT,
        json=valid_body(),
        headers={"X-Request-ID": request_id},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == request_id


@pytest.mark.parametrize("invalid_request_id", ["contains spaces", "x" * 129, ""])
def test_invalid_request_id_is_replaced(invalid_request_id: str) -> None:
    response = client.get(
        "/health",
        headers={"X-Request-ID": invalid_request_id},
    )

    generated = response.headers["X-Request-ID"]
    assert generated != invalid_request_id
    assert UUID_PATTERN.fullmatch(generated)


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:5173", "http://127.0.0.1:5173"],
)
def test_development_cors_origins_are_allowed(origin: str) -> None:
    response = client.post(
        ENDPOINT,
        json=valid_body(),
        headers={"Origin": origin},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-expose-headers"] == "X-Request-ID"


def test_unapproved_origin_receives_no_permissive_cors_header() -> None:
    response = client.post(
        ENDPOINT,
        json=valid_body(),
        headers={"Origin": "https://unapproved.example"},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_configured_request_body_limit_returns_controlled_413() -> None:
    limited_app = create_app(Settings(max_request_body_bytes=128))
    limited_client = TestClient(limited_app, raise_server_exceptions=False)

    response = limited_client.post(ENDPOINT, json=valid_body("x" * 256))

    assert response.status_code == 413
    assert response.json() == {
        "error": {
            "code": "TRANSCRIPT_TOO_LARGE",
            "message": "The request body exceeds the allowed size.",
            "details": {"max_body_bytes": 128},
        }
    }
    assert UUID_PATTERN.fullmatch(response.headers["X-Request-ID"])


def test_boundary_logging_contains_metadata_but_not_transcript(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def capture_log(message: str, *, extra: dict[str, object]) -> None:
        captured.append({"message": message, **extra})

    monkeypatch.setattr(middleware_module._logger, "info", capture_log)
    sentinel = "PRIVATE_TRANSCRIPT_SENTINEL"

    response = client.post(ENDPOINT, json=valid_body(sentinel))

    assert response.status_code == 200
    assert len(captured) == 1
    assert captured[0]["event"] == "http_request_completed"
    assert captured[0]["method"] == "POST"
    assert captured[0]["path"] == ENDPOINT
    assert captured[0]["status_code"] == 200
    assert sentinel not in repr(captured)


def test_settings_reject_wildcard_cors_origin() -> None:
    with pytest.raises(ValueError, match="wildcard CORS origins"):
        Settings(allowed_origins=("*",))


def test_settings_load_allowed_origins_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "SPONSORGUARD_ALLOWED_ORIGINS",
        "https://review.example,http://localhost:4173",
    )

    settings = Settings.from_environment()

    assert settings.allowed_origins == (
        "https://review.example",
        "http://localhost:4173",
    )


@pytest.mark.parametrize(
    "origin",
    [
        "https://user:password@example.com",
        "https://example.com/path",
        "javascript:alert(1)",
    ],
)
def test_settings_reject_invalid_cors_origins(origin: str) -> None:
    with pytest.raises(ValueError, match="invalid CORS origin"):
        Settings(allowed_origins=(origin,))


def test_configured_deployment_origin_is_allowed() -> None:
    app = create_app(
        Settings(allowed_origins=("https://creatorpreflight.example",))
    )
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        ENDPOINT,
        json=valid_body(),
        headers={"Origin": "https://creatorpreflight.example"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "https://creatorpreflight.example"
    )


def test_production_requires_explicit_allowed_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREATORPREFLIGHT_ENV", "production")
    monkeypatch.delenv("SPONSORGUARD_ALLOWED_ORIGINS", raising=False)
    with pytest.raises(ValueError, match="SPONSORGUARD_ALLOWED_ORIGINS"):
        Settings.from_environment()


def test_production_accepts_configured_https_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREATORPREFLIGHT_ENV", "production")
    monkeypatch.setenv(
        "SPONSORGUARD_ALLOWED_ORIGINS",
        "https://creatorpreflight.example,http://localhost:5173",
    )
    settings = Settings.from_environment()
    assert settings.is_production
    assert settings.allowed_origins == (
        "https://creatorpreflight.example",
        "http://localhost:5173",
    )


def test_missing_content_length_still_enforces_body_limit() -> None:
    from starlette.requests import Request

    from app.api.middleware import BodyTooLarge, RequestBodyLimitMiddleware
    from app.schemas.errors import APIErrorCode

    payload = json.dumps(valid_body("x" * 400)).encode("utf-8")

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": payload, "more_body": False}

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": ENDPOINT,
        "raw_path": ENDPOINT.encode(),
        "query_string": b"",
        "headers": [(b"content-type", b"application/json")],
        "client": ("testclient", 50000),
        "server": ("test", 80),
    }
    request = Request(scope, receive)

    async def expect_limit() -> None:
        RequestBodyLimitMiddleware.install_streaming_limit(
            request,
            limit=64,
            code=APIErrorCode.TRANSCRIPT_TOO_LARGE,
            message="The request body exceeds the allowed size.",
        )
        with pytest.raises(BodyTooLarge) as captured:
            await request.body()
        assert captured.value.limit == 64
        assert captured.value.code is APIErrorCode.TRANSCRIPT_TOO_LARGE

    asyncio.run(expect_limit())
