import pytest
from pydantic import ValidationError

from app.domain.media import (
    MediaInspection,
    MediaOrientation,
    TimeRange,
    aspect_ratio_matches,
    classify_orientation,
)


def test_portrait_square_and_landscape_classification() -> None:
    assert classify_orientation(1080 / 1920) is MediaOrientation.PORTRAIT
    assert classify_orientation(1.0) is MediaOrientation.SQUARE
    assert classify_orientation(1920 / 1080) is MediaOrientation.LANDSCAPE


def test_aspect_ratio_tolerance_accepts_vertical_hd() -> None:
    assert aspect_ratio_matches(1080 / 1920, 9 / 16, tolerance=0.08)
    assert not aspect_ratio_matches(1920 / 1080, 9 / 16, tolerance=0.08)


def test_time_range_rejects_inverted_or_empty_span() -> None:
    with pytest.raises(ValidationError):
        TimeRange(start_seconds=4.0, end_seconds=4.0)
    with pytest.raises(ValidationError):
        TimeRange(start_seconds=5.0, end_seconds=2.0)


def test_media_inspection_is_immutable_and_derived() -> None:
    media = MediaInspection(
        display_filename="clip.mp4",
        size_bytes=2048,
        duration_seconds=8.5,
        width=1080,
        height=1920,
        has_audio=True,
    )
    assert media.orientation is MediaOrientation.PORTRAIT
    assert media.aspect_ratio == pytest.approx(0.5625)
    with pytest.raises(ValidationError):
        media.width = 720  # type: ignore[misc]
