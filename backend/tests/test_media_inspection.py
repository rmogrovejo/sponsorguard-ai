from pathlib import Path

import pytest

from app.domain.media import MediaOrientation
from app.domain.shortform import DEFAULT_SILENCE_ANALYSIS
from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode
from app.services.media_inspection import (
    detect_low_energy_intervals,
    find_low_energy_ranges,
    inspect_video_file,
    sanitize_display_filename,
)
from tests.media_fixtures import write_test_mp4


def test_sanitize_display_filename_strips_paths_and_rejects_unsafe_names() -> None:
    assert sanitize_display_filename(r"..\..\secret\clip.mp4") == "clip.mp4"
    with pytest.raises(MediaInspectionError) as captured:
        sanitize_display_filename("..")
    assert captured.value.code is MediaInspectionErrorCode.UNSAFE_FILENAME


def test_inspects_portrait_duration_and_audio(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "portrait.mp4",
        width=320,
        height=568,
        duration_seconds=3.0,
    )
    media = inspect_video_file(path, display_filename="portrait.mp4", size_bytes=path.stat().st_size)

    assert media.orientation is MediaOrientation.PORTRAIT
    assert media.width == 320
    assert media.height == 568
    assert media.has_audio is True
    assert media.duration_seconds == pytest.approx(3.0, abs=0.35)


def test_inspects_landscape_and_square(tmp_path: Path) -> None:
    landscape = inspect_video_file(
        write_test_mp4(tmp_path / "wide.mp4", width=320, height=180, duration_seconds=2.0),
        display_filename="wide.mp4",
        size_bytes=100,
    )
    square = inspect_video_file(
        write_test_mp4(tmp_path / "square.mp4", width=240, height=240, duration_seconds=2.0),
        display_filename="square.mp4",
        size_bytes=100,
    )
    assert landscape.orientation is MediaOrientation.LANDSCAPE
    assert square.orientation is MediaOrientation.SQUARE


def test_inspects_video_without_audio(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "silent-container.mp4",
        width=320,
        height=568,
        duration_seconds=2.0,
        with_audio=False,
    )
    media = inspect_video_file(path, display_filename="silent-container.mp4", size_bytes=12)
    assert media.has_audio is False


def test_detects_extended_silence_and_ignores_short_pauses(tmp_path: Path) -> None:
    long_gap = write_test_mp4(
        tmp_path / "gap.mp4",
        width=160,
        height=284,
        duration_seconds=4.0,
        silence_ranges=((1.2, 3.4),),
    )
    short_pause = write_test_mp4(
        tmp_path / "pause.mp4",
        width=160,
        height=284,
        duration_seconds=3.0,
        silence_ranges=((1.1, 1.5),),
    )

    gaps = detect_low_energy_intervals(long_gap, config=DEFAULT_SILENCE_ANALYSIS)
    pauses = detect_low_energy_intervals(short_pause, config=DEFAULT_SILENCE_ANALYSIS)

    assert len(gaps) == 1
    assert gaps[0].duration_seconds == pytest.approx(2.2, abs=0.4)
    assert gaps[0].start_seconds == pytest.approx(1.2, abs=0.4)
    assert pauses == ()


def test_detects_multiple_silence_windows() -> None:
    sample_rate = DEFAULT_SILENCE_ANALYSIS.sample_rate
    samples = [0.2] * (sample_rate * 8)
    for index in range(int(1.0 * sample_rate), int(3.1 * sample_rate)):
        samples[index] = 0.0
    for index in range(int(5.0 * sample_rate), int(7.2 * sample_rate)):
        samples[index] = 0.0

    ranges = find_low_energy_ranges(samples, DEFAULT_SILENCE_ANALYSIS)

    assert len(ranges) == 2
    assert ranges[0].duration_seconds == pytest.approx(2.1, abs=0.3)
    assert ranges[1].duration_seconds == pytest.approx(2.2, abs=0.3)


def test_corrupted_file_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "broken.mp4"
    path.write_bytes(b"not a video")
    with pytest.raises(MediaInspectionError) as captured:
        inspect_video_file(path, display_filename="broken.mp4", size_bytes=11)
    assert captured.value.code is MediaInspectionErrorCode.UNSUPPORTED_MEDIA


def test_empty_upload_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "empty.mp4"
    path.write_bytes(b"")
    with pytest.raises(MediaInspectionError) as captured:
        inspect_video_file(path, display_filename="empty.mp4", size_bytes=0)
    assert captured.value.code is MediaInspectionErrorCode.EMPTY_UPLOAD
