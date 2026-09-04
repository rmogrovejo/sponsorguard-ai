from __future__ import annotations

from dataclasses import dataclass

from app.domain.media import TimeRange


@dataclass(frozen=True, slots=True)
class ShortFormSemanticRequest:
    opening: TimeRange
    ending: TimeRange
    video_duration_seconds: float
    opening_audio: bytes | None = None
    ending_audio: bytes | None = None
    opening_speech_text: str | None = None
    ending_speech_text: str | None = None
