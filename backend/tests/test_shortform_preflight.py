from pathlib import Path
from unittest.mock import patch

from app.domain.shortform import PreflightStatus, ShortFormPlatform
from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode
from app.services.shortform_preflight import analyze_shortform_video
from tests.media_fixtures import write_test_mp4


def test_vertical_hd_like_clip_passes_format_and_audio(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "hd.mp4",
        width=1080,
        height=1920,
        duration_seconds=4.0,
    )
    report = analyze_shortform_video(
        path,
        platform=ShortFormPlatform.TIKTOK,
        display_filename="hd.mp4",
        size_bytes=path.stat().st_size,
    )
    by_id = {item.check_id: item for item in report.findings}
    assert by_id["video_present"].status is PreflightStatus.PASS
    assert by_id["orientation"].status is PreflightStatus.PASS
    assert by_id["resolution"].status is PreflightStatus.PASS
    assert by_id["audio_track"].status is PreflightStatus.PASS
    assert report.summary.readiness_score is not None


def test_landscape_fails_orientation_and_low_res_is_warning(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "wide.mp4",
        width=320,
        height=180,
        duration_seconds=4.0,
    )
    report = analyze_shortform_video(
        path,
        platform=ShortFormPlatform.YOUTUBE_SHORTS,
        display_filename="wide.mp4",
        size_bytes=path.stat().st_size,
    )
    by_id = {item.check_id: item for item in report.findings}
    assert by_id["orientation"].status is PreflightStatus.FAIL
    assert by_id["resolution"].status is PreflightStatus.WARNING


def test_no_audio_warns_and_leaves_pacing_unevaluated(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "mute.mp4",
        width=320,
        height=568,
        duration_seconds=4.0,
        with_audio=False,
    )
    report = analyze_shortform_video(
        path,
        platform=ShortFormPlatform.INSTAGRAM_REELS,
        display_filename="mute.mp4",
        size_bytes=path.stat().st_size,
    )
    by_id = {item.check_id: item for item in report.findings}
    assert by_id["audio_track"].status is PreflightStatus.WARNING
    assert by_id["dead_air"].status is PreflightStatus.NOT_EVALUATED
    assert by_id["orientation"].status is PreflightStatus.PASS
    assert report.summary.not_evaluated == 1


def test_audio_decode_failure_keeps_format_and_skips_pacing(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "audio-fail.mp4",
        width=320,
        height=568,
        duration_seconds=4.0,
    )
    with patch(
        "app.services.shortform_preflight.detect_low_energy_intervals",
        side_effect=MediaInspectionError(
            "decode failed",
            code=MediaInspectionErrorCode.CORRUPT_MEDIA,
        ),
    ):
        report = analyze_shortform_video(
            path,
            platform=ShortFormPlatform.TIKTOK,
            display_filename="audio-fail.mp4",
            size_bytes=path.stat().st_size,
        )
    by_id = {item.check_id: item for item in report.findings}
    assert by_id["orientation"].status is PreflightStatus.PASS
    assert by_id["audio_track"].status is PreflightStatus.PASS
    assert by_id["dead_air"].status is PreflightStatus.NOT_EVALUATED


def test_short_clip_fails_duration(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "tiny.mp4",
        width=320,
        height=568,
        duration_seconds=1.0,
    )
    report = analyze_shortform_video(
        path,
        platform=ShortFormPlatform.TIKTOK,
        display_filename="tiny.mp4",
        size_bytes=path.stat().st_size,
    )
    by_id = {item.check_id: item for item in report.findings}
    assert by_id["duration"].status is PreflightStatus.FAIL


def test_square_frame_is_a_format_warning(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "square.mp4",
        width=720,
        height=720,
        duration_seconds=4.0,
    )
    report = analyze_shortform_video(
        path,
        platform=ShortFormPlatform.TIKTOK,
        display_filename="square.mp4",
        size_bytes=path.stat().st_size,
    )
    orientation = next(item for item in report.findings if item.check_id == "orientation")
    assert orientation.status is PreflightStatus.WARNING


def test_pacing_finding_uses_measured_ranges(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "gap.mp4",
        width=160,
        height=284,
        duration_seconds=4.0,
        silence_ranges=((1.2, 3.4),),
    )
    report = analyze_shortform_video(
        path,
        platform=ShortFormPlatform.TIKTOK,
        display_filename="gap.mp4",
        size_bytes=path.stat().st_size,
    )
    pacing = next(item for item in report.findings if item.check_id == "dead_air")
    assert pacing.status is PreflightStatus.WARNING
    assert pacing.ranges
    assert pacing.recommendation == "Review this pacing gap before publishing."
    assert all(item.start_seconds < item.end_seconds for item in pacing.ranges)
