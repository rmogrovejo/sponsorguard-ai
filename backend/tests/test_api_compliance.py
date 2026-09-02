from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


ENDPOINT = "/api/v1/compliance/analyze"
FIXTURES = Path(__file__).parent / "fixtures"
client = TestClient(app, raise_server_exceptions=False)


def request_body(
    requirements: list[dict[str, object]],
    *,
    transcript: str | None = None,
) -> dict[str, object]:
    content = transcript or (FIXTURES / "acme_vpn.srt").read_text(encoding="utf-8")
    return {
        "requirements": requirements,
        "transcript": {"format": "srt", "content": content},
    }


def required_mention(requirement_id: str = "req_brand") -> dict[str, object]:
    return {
        "id": requirement_id,
        "type": "required_mention",
        "description": "Mention AcmeVPN",
        "value": "AcmeVPN",
    }


def test_valid_srt_with_passing_requirement() -> None:
    response = client.post(ENDPOINT, json=request_body([required_mention()]))

    assert response.status_code == 200
    assert response.json() == {
        "summary": {
            "total": 1,
            "passed": 1,
            "warnings": 0,
            "failed": 0,
            "compliance_score": 100.0,
        },
        "results": [
            {
                "requirement_id": "req_brand",
                "status": "pass",
                "reason_code": "REQUIRED_MENTION_FOUND",
                "reason": 'Required mention "AcmeVPN" was found.',
                "source_segment_index": 1,
                "timestamp_seconds": 38.0,
                "evidence": "Today's video is sponsored by AcmeVPN.",
            }
        ],
    }


def test_valid_srt_with_failing_requirement() -> None:
    requirement = {
        "id": "req_coupon",
        "type": "required_exact_token",
        "description": "Say the creator code",
        "value": "CREATOR25",
    }

    response = client.post(ENDPOINT, json=request_body([requirement]))

    assert response.status_code == 200
    assert response.json() == {
        "summary": {
            "total": 1,
            "passed": 0,
            "warnings": 0,
            "failed": 1,
            "compliance_score": 0.0,
        },
        "results": [
            {
                "requirement_id": "req_coupon",
                "status": "fail",
                "reason_code": "REQUIRED_TOKEN_MISSING",
                "reason": 'Required token "CREATOR25" was not found.',
                "source_segment_index": None,
                "timestamp_seconds": None,
                "evidence": None,
            }
        ],
    }


def test_mixed_acme_campaign_preserves_order_and_summary() -> None:
    requirements = [
        {
            "id": "req_timing",
            "type": "required_mention_before",
            "description": "Mention AcmeVPN before 00:30",
            "value": "AcmeVPN",
            "before_seconds": 30,
        },
        required_mention(),
        {
            "id": "req_coupon",
            "type": "required_exact_token",
            "description": "Say the creator code",
            "value": "CREATOR25",
        },
        {
            "id": "req_forbidden",
            "type": "forbidden_phrase",
            "description": "Avoid an unsupported claim",
            "value": "guaranteed anonymity",
        },
    ]

    response = client.post(ENDPOINT, json=request_body(requirements))
    body = response.json()

    assert response.status_code == 200
    assert [item["requirement_id"] for item in body["results"]] == [
        "req_timing",
        "req_brand",
        "req_coupon",
        "req_forbidden",
    ]
    assert [item["status"] for item in body["results"]] == [
        "fail",
        "pass",
        "fail",
        "pass",
    ]
    assert body["summary"] == {
        "total": 4,
        "passed": 2,
        "warnings": 0,
        "failed": 2,
        "compliance_score": 50.0,
    }


def test_api_returns_exact_evidence_and_timestamp_for_late_mention() -> None:
    requirement = {
        "id": "req_timing",
        "type": "required_mention_before",
        "description": "Mention AcmeVPN before 00:30",
        "value": "AcmeVPN",
        "before_seconds": 30,
    }

    response = client.post(ENDPOINT, json=request_body([requirement]))
    result = response.json()["results"][0]

    assert result["reason_code"] == "REQUIRED_MENTION_TOO_LATE"
    assert result["source_segment_index"] == 1
    assert result["timestamp_seconds"] == 38.0
    assert result["evidence"] == "Today's video is sponsored by AcmeVPN."


def test_openapi_exposes_only_the_versioned_analysis_route_and_health() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/health" in paths
    assert ENDPOINT in paths
    assert "post" in paths[ENDPOINT]
