from collections.abc import Sequence

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.domain.audience_pulse import (
    AudienceComment,
    AudiencePulseProviderOpportunity,
    AudiencePulseProviderOutput,
    AudiencePulseProviderReply,
    AudiencePulseProviderTheme,
    CommentClassification,
)
from app.integrations.llm.exceptions import (
    LLMConfigurationError,
    LLMProviderTimeoutError,
    LLMRateLimitError,
)
from app.main import create_app


class StubAudiencePulseAnalyzer:
    provider_name = "stub"
    model_name = "stub-model"
    calls = 0

    def __init__(
        self,
        output: AudiencePulseProviderOutput | None = None,
        *,
        error: Exception | None = None,
    ) -> None:
        self._output = output
        self._error = error
        self.received: list[tuple[AudienceComment, ...]] = []
        self.languages: list[str] = []

    async def analyze_audience(
        self,
        comments: Sequence[AudienceComment],
        *,
        analysis_language: str = "en",
    ) -> AudiencePulseProviderOutput:
        StubAudiencePulseAnalyzer.calls += 1
        self.received.append(tuple(comments))
        self.languages.append(analysis_language)
        if self._error is not None:
            raise self._error
        if self._output is not None:
            return self._output
        classifications = tuple(
            CommentClassification(comment_id=comment.id, category="positive")
            for comment in comments
        )
        first = comments[0].id if comments else "c1"
        return AudiencePulseProviderOutput(
            classifications=classifications,
            themes=(
                AudiencePulseProviderTheme(
                    summary="Viewers want an AMD version",
                    evidence_comment_ids=(first,),
                ),
            ),
            reply_worthy=(
                AudiencePulseProviderReply(kind="question", comment_id=first),
            ),
            opportunities=(
                AudiencePulseProviderOpportunity(
                    title="AMD optimization follow-up",
                    evidence_comment_ids=(first,),
                ),
            ),
        )


class FakeYouTubeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class FakeYouTubeHttp:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def get(self, url: str, *, params: dict | None = None) -> FakeYouTubeResponse:
        self.calls.append(url)
        if "videos" in url:
            return FakeYouTubeResponse(
                200,
                {
                    "items": [
                        {
                            "snippet": {
                                "title": "PC Tips",
                                "channelTitle": "Creator",
                            },
                            "statistics": {"commentCount": "3"},
                        }
                    ]
                },
            )
        return FakeYouTubeResponse(
            200,
            {
                "items": [
                    {
                        "snippet": {
                            "topLevelComment": {
                                "snippet": {
                                    "textDisplay": "Does this work on Windows 11?",
                                    "authorDisplayName": "Alex",
                                }
                            }
                        }
                    },
                    {
                        "snippet": {
                            "topLevelComment": {
                                "snippet": {
                                    "textDisplay": "Make an AMD version",
                                    "authorDisplayName": "Sam",
                                }
                            }
                        }
                    },
                ]
            },
        )

    async def aclose(self) -> None:
        return None


@pytest.fixture(autouse=True)
def reset_stub_calls() -> None:
    StubAudiencePulseAnalyzer.calls = 0


@pytest.fixture
def settings() -> Settings:
    return Settings()


def _patch_youtube(monkeypatch: pytest.MonkeyPatch, fake: FakeYouTubeHttp) -> None:
    from app.integrations.youtube import client as yt_module

    original_init = yt_module.YouTubeDataClient.__init__

    def patched_init(self, *, api_key, timeout_seconds=20.0, http_client=None):
        original_init(
            self,
            api_key=api_key,
            timeout_seconds=timeout_seconds,
            http_client=fake,
        )

    monkeypatch.setattr(yt_module.YouTubeDataClient, "__init__", patched_init)


def test_manual_analyze_success(settings: Settings) -> None:
    app = create_app(
        settings=settings,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(),
    )
    client = TestClient(app)
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={
            "comments_text": "Does this work on Windows 11?\nMake an AMD version\nGreat tip!",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_status"] == "complete"
    assert body["source"] == "manual"
    assert body["comments_loaded"] == 3
    assert len(body["comments"]) == 3
    actionable = [item for item in body["signals"] if item["category"] != "low_information"]
    assert sum(item["percentage"] or 0 for item in actionable) == 100


def test_rejects_both_or_neither(settings: Settings) -> None:
    app = create_app(
        settings=settings,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(),
    )
    client = TestClient(app)
    both = client.post(
        "/api/v1/audience-pulse/analyze",
        json={
            "youtube_url": "https://youtube.com/shorts/abcdefghijk",
            "comments_text": "hello",
        },
    )
    assert both.status_code == 422
    empty = client.post("/api/v1/audience-pulse/analyze", json={})
    assert empty.status_code == 422


def test_manual_gemini_unavailable_preserves_comments(settings: Settings) -> None:
    app = create_app(
        settings=settings,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(
            error=LLMConfigurationError("not configured"),
        ),
    )
    client = TestClient(app)
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"comments_text": "hello world\nlol"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_status"] == "not_evaluated"
    assert body["analysis_error_code"] == "LLM_PROVIDER_CONFIGURATION_ERROR"
    assert body["comments_loaded"] == 2
    assert len(body["comments"]) == 2
    assert body["signals"] == []
    assert body["themes"] == []


def test_youtube_gemini_429_partial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(youtube_api_key="test-key")
    fake = FakeYouTubeHttp()
    _patch_youtube(monkeypatch, fake)
    app = create_app(
        settings=settings,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(error=LLMRateLimitError("429")),
    )
    client = TestClient(app)
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"youtube_url": "https://youtube.com/shorts/abcdefghijk"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_status"] == "not_evaluated"
    assert body["analysis_error_code"] == "LLM_PROVIDER_RATE_LIMITED"
    assert body["video"]["title"] == "PC Tips"
    assert body["comments_loaded"] == 2
    assert body["signals"] == []


def test_youtube_gemini_timeout_preserves_comments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(youtube_api_key="test-key")
    fake = FakeYouTubeHttp()
    _patch_youtube(monkeypatch, fake)
    app = create_app(
        settings=settings,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(
            error=LLMProviderTimeoutError("timeout"),
        ),
    )
    client = TestClient(app)
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"youtube_url": "https://youtube.com/shorts/abcdefghijk"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_error_code"] == "LLM_PROVIDER_TIMEOUT"
    assert len(body["comments"]) == 2


def test_youtube_not_configured(settings: Settings) -> None:
    assert settings.youtube_api_key is None
    app = create_app(
        settings=settings,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(),
    )
    client = TestClient(app)
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"youtube_url": "https://youtube.com/shorts/abcdefghijk"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "YOUTUBE_NOT_CONFIGURED"


def test_retry_loaded_comments_skips_youtube(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(youtube_api_key="test-key")
    fake = FakeYouTubeHttp()
    _patch_youtube(monkeypatch, fake)
    analyzer = StubAudiencePulseAnalyzer()
    app = create_app(settings=settings, audience_pulse_analyzer=analyzer)
    client = TestClient(app)
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={
            "loaded_comments": [
                {"id": "c1", "text": "Does this work on Windows 11?", "author": "Alex"},
                {"id": "c2", "text": "Make an AMD version", "author": "Sam"},
            ],
            "video": {
                "id": "abcdefghijk",
                "title": "PC Tips",
                "channel_title": "Creator",
                "comment_count_public": 3,
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "session"
    assert body["analysis_status"] == "complete"
    assert body["video"]["title"] == "PC Tips"
    assert fake.calls == []
    assert len(analyzer.received) == 1


def test_audience_pulse_rate_limited(settings: Settings) -> None:
    limited = Settings(
        rate_limit_expensive_per_minute=1,
        rate_limit_window_seconds=60.0,
    )
    app = create_app(
        settings=limited,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(),
    )
    client = TestClient(app)
    first = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"comments_text": "one"},
    )
    second = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"comments_text": "two"},
    )
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"


def test_analysis_language_accepted_and_passed_to_provider(settings: Settings) -> None:
    analyzer = StubAudiencePulseAnalyzer()
    app = create_app(settings=settings, audience_pulse_analyzer=analyzer)
    client = TestClient(app)
    original = "Does this work on Windows 11?\nMake an AMD version"
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"comments_text": original, "analysis_language": "es"},
    )
    assert response.status_code == 200
    body = response.json()
    assert analyzer.languages == ["es"]
    assert body["comments"][0]["text"] == "Does this work on Windows 11?"
    assert body["comments"][1]["text"] == "Make an AMD version"


def test_analysis_language_rejected(settings: Settings) -> None:
    app = create_app(
        settings=settings,
        audience_pulse_analyzer=StubAudiencePulseAnalyzer(),
    )
    client = TestClient(app)
    response = client.post(
        "/api/v1/audience-pulse/analyze",
        json={"comments_text": "hello world", "analysis_language": "fr"},
    )
    assert response.status_code == 422
