from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.domain.shortform_speech import ShortFormProviderDocument
from app.integrations.llm.exceptions import (
    LLMProviderTimeoutError,
    LLMRateLimitError,
    LLMProviderUnavailableError,
)
from app.integrations.llm.shortform_request import ShortFormSemanticRequest
from app.main import create_app
from tests.media_fixtures import write_test_mp4
from tests.shortform_semantic_fixtures import provider_document


ENDPOINT = "/api/v1/shortform/analyze"


class FakeShortFormAnalyzer:
    def __init__(
        self,
        *,
        document: ShortFormProviderDocument | None = None,
        error: Exception | None = None,
    ) -> None:
        self.document = document
        self.error = error
        self.calls = 0

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return "gemini-test"

    async def analyze_shortform(
        self,
        request: ShortFormSemanticRequest,
    ) -> ShortFormProviderDocument:
        self.calls += 1
        if self.error is not None:
            raise self.error
        assert request.opening_audio is not None
        assert self.document is not None
        return self.document


class FakeSuggestionGenerator:
    def __init__(self) -> None:
        self.calls = 0

    @property
    def provider_name(self) -> str:
        return "fake"

    @property
    def model_name(self) -> str:
        return "fake-model"

    async def generate_suggestion(self, context: object) -> object:
        self.calls += 1
        raise AssertionError("analysis must not generate suggestions")


def make_client(
    settings: Settings | None = None,
    shortform_analyzer: FakeShortFormAnalyzer | None = None,
    shortform_suggestion_generator: FakeSuggestionGenerator | None = None,
) -> TestClient:
    return TestClient(
        create_app(
            settings=settings or Settings(),
            shortform_analyzer=shortform_analyzer,
            shortform_suggestion_generator=shortform_suggestion_generator,
        ),
        raise_server_exceptions=False,
    )


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
    assert body["summary"]["total"] == 9
    assert {item["check_id"] for item in body["findings"]} >= {
        "video_present",
        "orientation",
        "resolution",
        "duration",
        "audio_track",
        "speech_activity",
        "opening",
        "dead_air",
        "cta",
    }
    assert [item["check_id"] for item in body["findings"]] == [
        "video_present",
        "orientation",
        "resolution",
        "duration",
        "audio_track",
        "speech_activity",
        "opening",
        "dead_air",
        "cta",
    ]


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


def test_api_successful_semantic_analysis(tmp_path: Path) -> None:
    video = write_test_mp4(tmp_path / "talk.mp4", width=320, height=568, duration_seconds=8.0)
    analyzer = FakeShortFormAnalyzer(document=provider_document(cta_indices=()))
    response = make_client(shortform_analyzer=analyzer).post(
        ENDPOINT,
        data={"platform": "tiktok"},
        files={"video": ("talk.mp4", video.read_bytes(), "video/mp4")},
        headers={"X-Request-ID": "shortform-semantic-1"},
    )
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "shortform-semantic-1"
    body = response.json()
    opening = next(item for item in body["findings"] if item["check_id"] == "opening")
    assert opening["status"] == "pass"
    assert opening["evidence_text"] == "Three settings are destroying your FPS."
    assert analyzer.calls == 1


def test_api_provider_failure_still_returns_partial_report(tmp_path: Path) -> None:
    video = write_test_mp4(tmp_path / "talk.mp4", width=320, height=568, duration_seconds=6.0)
    analyzer = FakeShortFormAnalyzer(error=LLMProviderUnavailableError("down"))
    response = make_client(shortform_analyzer=analyzer).post(
        ENDPOINT,
        data={"platform": "youtube_shorts"},
        files={"video": ("talk.mp4", video.read_bytes(), "video/mp4")},
        headers={"X-Request-ID": "shortform-partial-1"},
    )
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "shortform-partial-1"
    body = response.json()
    by_id = {item["check_id"]: item for item in body["findings"]}
    assert by_id["orientation"]["status"] == "pass"
    assert by_id["audio_track"]["status"] == "pass"
    assert by_id["opening"]["status"] == "not_evaluated"
    assert by_id["cta"]["status"] == "not_evaluated"
    assert "secret" not in response.text
    assert body["summary"]["not_evaluated"] >= 2


def test_api_timeout_and_rate_limit_stay_http_success(tmp_path: Path) -> None:
    video = write_test_mp4(tmp_path / "talk.mp4", width=160, height=284, duration_seconds=5.0)
    for error in (
        LLMProviderTimeoutError("late"),
        LLMRateLimitError("slow"),
    ):
        response = make_client(shortform_analyzer=FakeShortFormAnalyzer(error=error)).post(
            ENDPOINT,
            data={"platform": "tiktok"},
            files={"video": ("talk.mp4", video.read_bytes(), "video/mp4")},
        )
        assert response.status_code == 200
        opening = next(item for item in response.json()["findings"] if item["check_id"] == "opening")
        assert opening["status"] == "not_evaluated"


def test_openapi_exposes_shortform_route() -> None:
    paths = make_client().get("/openapi.json").json()["paths"]
    assert ENDPOINT in paths
    assert "post" in paths[ENDPOINT]


def test_analyze_does_not_generate_suggestions(tmp_path: Path) -> None:
    video = write_test_mp4(tmp_path / "clip.mp4", width=320, height=568, duration_seconds=3.5)
    suggestions = FakeSuggestionGenerator()
    response = make_client(shortform_suggestion_generator=suggestions).post(
        ENDPOINT,
        data={"platform": "tiktok"},
        files={"video": ("clip.mp4", video.read_bytes(), "video/mp4")},
    )
    assert response.status_code == 200
    assert suggestions.calls == 0
    assert "suggested_text" not in response.text
    assert "SUGGESTED OPENING" not in response.text
