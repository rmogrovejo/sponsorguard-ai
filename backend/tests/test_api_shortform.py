from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests.media_fixtures import write_test_mp4


ENDPOINT = "/api/v1/shortform/analyze"


def make_client(settings: Settings | None = None) -> TestClient:
    return TestClient(create_app(settings=settings or Settings()), raise_server_exceptions=False)


def test_api_analyzes_mp4_and_preserves_request_id(tmp_path: Path) -> None:
    video = write_test_mp4(tmp_path / "clip.mp4", width=320, height=568, duration_seconds=3.5)
    response = make_client().post(
        ENDPOINT,
        data={"platform": "tiktok"},
        files={"video": ("clip.mp4", video.read_bytes(), "video/mp4")},
        headers={"X-Request-ID": "shortform-test-123"},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "shortform-test-123"
    body = response.json()
    assert body["platform"] == "tiktok"
    assert body["media"]["filename"] == "clip.mp4"
    assert body["media"]["orientation"] == "portrait"
    assert body["summary"]["total"] == 6
    assert {item["check_id"] for item in body["findings"]} >= {
        "video_present",
        "orientation",
        "resolution",
        "duration",
        "audio_track",
        "dead_air",
    }


def test_api_rejects_empty_upload() -> None:
    response = make_client().post(
        ENDPOINT,
        data={"platform": "tiktok"},
        files={"video": ("empty.mp4", b"", "video/mp4")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_MEDIA"


def test_api_rejects_wrong_extension() -> None:
    response = make_client().post(
        ENDPOINT,
        data={"platform": "tiktok"},
        files={"video": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA"


def test_api_rejects_corrupted_mp4() -> None:
    response = make_client().post(
        ENDPOINT,
        data={"platform": "instagram_reels"},
        files={"video": ("broken.mp4", b"not-a-real-mp4", "video/mp4")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA"
    assert "secret" not in response.text


def test_api_rejects_oversized_declared_body() -> None:
    settings = Settings(shortform_max_upload_bytes=128)
    response = make_client(settings).post(
        ENDPOINT,
        data={"platform": "tiktok"},
        files={"video": ("huge.mp4", b"x" * 256, "video/mp4")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "MEDIA_TOO_LARGE"


def test_api_rejects_unknown_platform(tmp_path: Path) -> None:
    video = write_test_mp4(tmp_path / "clip.mp4", width=160, height=284, duration_seconds=3.0)
    response = make_client().post(
        ENDPOINT,
        data={"platform": "broadcast"},
        files={"video": ("clip.mp4", video.read_bytes(), "video/mp4")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA"


def test_openapi_exposes_shortform_route() -> None:
    paths = make_client().get("/openapi.json").json()["paths"]
    assert ENDPOINT in paths
    assert "post" in paths[ENDPOINT]
