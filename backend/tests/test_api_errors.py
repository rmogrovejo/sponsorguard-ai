import json

import pytest
from fastapi.testclient import TestClient

import app.api.v1.routes.compliance as compliance_route
from app.main import app
from app.parsers.srt import MAX_SRT_CHARACTERS


ENDPOINT = "/api/v1/compliance/analyze"
client = TestClient(app, raise_server_exceptions=False)


def valid_requirement(requirement_id: str = "req_brand") -> dict[str, object]:
    return {
        "id": requirement_id,
        "type": "required_mention",
        "description": "Mention AcmeVPN",
        "value": "AcmeVPN",
    }


def valid_transcript() -> dict[str, str]:
    return {
        "format": "srt",
        "content": "1\n00:00:01,000 --> 00:00:02,000\nAcmeVPN.",
    }


def valid_body() -> dict[str, object]:
    return {
        "requirements": [valid_requirement()],
        "transcript": valid_transcript(),
    }


def assert_error(response: object, status_code: int, code: str) -> dict[str, object]:
    assert hasattr(response, "status_code")
    assert response.status_code == status_code  # type: ignore[union-attr]
    body = response.json()  # type: ignore[union-attr]
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str)
    return body


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"transcript": valid_transcript()},
        {"requirements": [valid_requirement()]},
    ],
)
def test_missing_request_fields_use_validation_envelope(
    payload: dict[str, object],
) -> None:
    response = client.post(ENDPOINT, json=payload)

    body = assert_error(response, 422, "REQUEST_VALIDATION_ERROR")
    assert "issues" in body["error"]["details"]


def test_empty_requirements_is_known_compliance_error() -> None:
    response = client.post(
        ENDPOINT,
        json={"requirements": [], "transcript": valid_transcript()},
    )

    body = assert_error(response, 400, "INVALID_COMPLIANCE_INPUT")
    assert body["error"]["details"] == {"reason_code": "empty_requirements"}


def test_duplicate_requirement_ids_is_not_internal_error() -> None:
    response = client.post(
        ENDPOINT,
        json={
            "requirements": [valid_requirement(), valid_requirement()],
            "transcript": valid_transcript(),
        },
    )

    body = assert_error(response, 400, "INVALID_COMPLIANCE_INPUT")
    assert body["error"]["details"] == {
        "reason_code": "duplicate_requirement_id"
    }


def test_unsupported_requirement_type_is_validation_error() -> None:
    requirement = valid_requirement()
    requirement["type"] = "semantic_claim"

    response = client.post(
        ENDPOINT,
        json={"requirements": [requirement], "transcript": valid_transcript()},
    )

    assert_error(response, 422, "REQUEST_VALIDATION_ERROR")


def test_unsupported_transcript_format_has_specific_error() -> None:
    transcript = valid_transcript()
    transcript["format"] = "vtt"

    response = client.post(
        ENDPOINT,
        json={"requirements": [valid_requirement()], "transcript": transcript},
    )

    body = assert_error(response, 400, "UNSUPPORTED_TRANSCRIPT_FORMAT")
    assert body["error"]["details"] == {"supported_formats": ["srt"]}


@pytest.mark.parametrize("content", ["", " \n\t ", "\ufeff"])
def test_blank_transcript_is_validation_error(content: str) -> None:
    transcript = valid_transcript()
    transcript["content"] = content

    response = client.post(
        ENDPOINT,
        json={"requirements": [valid_requirement()], "transcript": transcript},
    )

    assert_error(response, 422, "REQUEST_VALIDATION_ERROR")


def test_malformed_srt_uses_sanitized_parser_error() -> None:
    transcript = valid_transcript()
    transcript["content"] = "1\nprivate-path-C:\\secret\nAcmeVPN."

    response = client.post(
        ENDPOINT,
        json={"requirements": [valid_requirement()], "transcript": transcript},
    )

    body = assert_error(response, 400, "INVALID_TRANSCRIPT")
    assert body["error"]["message"] == "The transcript could not be parsed."
    assert body["error"]["details"] == {
        "reason_code": "missing_timestamp_separator",
        "block_number": 1,
        "line_number": 2,
    }
    assert "private-path" not in json.dumps(body)
    assert "MalformedTranscriptError" not in json.dumps(body)


def test_reversed_timestamps_are_invalid_transcript() -> None:
    transcript = valid_transcript()
    transcript["content"] = (
        "1\n00:00:03,000 --> 00:00:02,000\nAcmeVPN."
    )

    response = client.post(
        ENDPOINT,
        json={"requirements": [valid_requirement()], "transcript": transcript},
    )

    body = assert_error(response, 400, "INVALID_TRANSCRIPT")
    assert body["error"]["details"]["reason_code"] == "end_before_start"


def test_oversized_transcript_returns_413() -> None:
    transcript = valid_transcript()
    transcript["content"] = "x" * (MAX_SRT_CHARACTERS + 1)

    response = client.post(
        ENDPOINT,
        json={"requirements": [valid_requirement()], "transcript": transcript},
    )

    body = assert_error(response, 413, "TRANSCRIPT_TOO_LARGE")
    assert body["error"]["details"] == {
        "max_characters": MAX_SRT_CHARACTERS
    }


@pytest.mark.parametrize(
    "payload",
    [
        {
            "requirements": [valid_requirement()],
            "transcript": valid_transcript(),
            "unexpected": True,
        },
        {
            "requirements": [{**valid_requirement(), "unexpected": True}],
            "transcript": valid_transcript(),
        },
        {
            "requirements": [valid_requirement()],
            "transcript": {**valid_transcript(), "unexpected": True},
        },
    ],
)
def test_unexpected_fields_are_rejected(payload: dict[str, object]) -> None:
    response = client.post(ENDPOINT, json=payload)

    assert_error(response, 422, "REQUEST_VALIDATION_ERROR")


@pytest.mark.parametrize(
    "payload",
    [
        {"requirements": "not-a-list", "transcript": valid_transcript()},
        {"requirements": [42], "transcript": valid_transcript()},
        {"requirements": [valid_requirement()], "transcript": "not-an-object"},
        {
            "requirements": [valid_requirement()],
            "transcript": {"format": "srt", "content": 42},
        },
    ],
)
def test_wrong_primitive_types_are_rejected(payload: dict[str, object]) -> None:
    response = client.post(ENDPOINT, json=payload)

    assert_error(response, 422, "REQUEST_VALIDATION_ERROR")


def test_malformed_json_uses_validation_envelope() -> None:
    response = client.post(
        ENDPOINT,
        content=b'{"requirements": [',
        headers={"Content-Type": "application/json"},
    )

    assert_error(response, 422, "REQUEST_VALIDATION_ERROR")


def test_validation_error_does_not_echo_transcript_input() -> None:
    secret_content = "PRIVATE_TRANSCRIPT_SENTINEL"
    response = client.post(
        ENDPOINT,
        json={
            "requirements": "invalid",
            "transcript": {"format": "srt", "content": secret_content},
        },
    )

    body = assert_error(response, 422, "REQUEST_VALIDATION_ERROR")
    assert secret_content not in json.dumps(body)


def test_unexpected_failure_returns_safe_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "SECRET_INTERNAL_PATH_C:\\private"

    def fail_unexpectedly(*args: object, **kwargs: object) -> object:
        raise RuntimeError(secret)

    monkeypatch.setattr(compliance_route, "evaluate_compliance", fail_unexpectedly)
    response = client.post(ENDPOINT, json=valid_body())

    body = assert_error(response, 500, "INTERNAL_SERVER_ERROR")
    assert body["error"] == {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "An unexpected internal error occurred.",
        "details": None,
    }
    serialized = json.dumps(body)
    assert secret not in serialized
    assert "RuntimeError" not in serialized
    assert response.headers["X-Request-ID"]
