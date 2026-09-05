import pytest


@pytest.fixture(autouse=True)
def isolate_runtime_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep unit tests independent of a developer's production shell exports."""

    monkeypatch.delenv("CREATORPREFLIGHT_ENV", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("CREATORPREFLIGHT_LIVE_GEMINI", raising=False)
