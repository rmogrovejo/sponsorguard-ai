import asyncio
from pathlib import Path
from unittest.mock import patch

from app.domain.shortform import PreflightStatus, ShortFormPlatform
from app.domain.shortform_speech import CtaDecision, HookDecision
from app.integrations.llm.exceptions import LLMProviderTimeoutError
from app.integrations.llm.shortform_request import ShortFormSemanticRequest
from app.domain.shortform_speech import ShortFormProviderDocument
from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode
from app.services.shortform_preflight import analyze_shortform_video, run_shortform_preflight
from tests.media_fixtures import write_test_mp4
from tests.shortform_semantic_fixtures import provider_document


class FakeAnalyzer:
    def __init__(
        self,
        document: ShortFormProviderDocument | None = None,
        error: Exception | None = None,
    ) -> None:
        self.document = document
        self.error = error

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return "test"

    async def analyze_shortform(
        self,
        request: ShortFormSemanticRequest,
    ) -> ShortFormProviderDocument:
        if self.error is not None:
            raise self.error
        assert self.document is not None
        return self.document


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
    assert by_id["speech_activity"].status is PreflightStatus.NOT_EVALUATED
    assert by_id["opening"].status is PreflightStatus.NOT_EVALUATED
    assert by_id["cta"].status is PreflightStatus.NOT_EVALUATED
    assert by_id["orientation"].status is PreflightStatus.PASS
    assert report.summary.not_evaluated == 4


def test_audio_decode_failure_keeps_format_and_skips_pacing(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "audio-fail.mp4",
        width=320,
        height=568,
        duration_seconds=4.0,
    )
    with patch(
        "app.services.shortform_preflight.inspect_audio_file",
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
    assert by_id["speech_activity"].status is PreflightStatus.NOT_EVALUATED
    assert by_id["opening"].status is PreflightStatus.NOT_EVALUATED
    assert by_id["cta"].status is PreflightStatus.NOT_EVALUATED


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


def test_mixed_deterministic_and_semantic_results_keep_score_policy(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "mix.mp4",
        width=320,
        height=180,
        duration_seconds=8.0,
        silence_ranges=((2.0, 5.0),),
    )
    document = provider_document(
        hook_decision=HookDecision.REVIEW,
        generic_intro=True,
        cta_decision=CtaDecision.NOT_FOUND,
        cta_indices=(),
    )
    report = asyncio.run(
        run_shortform_preflight(
            path,
            platform=ShortFormPlatform.TIKTOK,
            display_filename="mix.mp4",
            size_bytes=path.stat().st_size,
            analyzer=FakeAnalyzer(document),
        )
    )
    by_id = {item.check_id: item for item in report.findings}
    assert by_id["orientation"].status is PreflightStatus.FAIL
    assert by_id["opening"].status is PreflightStatus.WARNING
    assert by_id["cta"].status is PreflightStatus.WARNING
    assert by_id["dead_air"].status is PreflightStatus.WARNING
    assert report.summary.failed >= 1
    assert report.summary.readiness_score is not None
    assert report.priorities[0].check_id == "orientation"
    assert [item.check_id for item in report.findings] == [
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


def test_provider_failure_preserves_deterministic_findings(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "ok.mp4",
        width=1080,
        height=1920,
        duration_seconds=5.0,
    )
    report = asyncio.run(
        run_shortform_preflight(
            path,
            platform=ShortFormPlatform.TIKTOK,
            display_filename="ok.mp4",
            size_bytes=path.stat().st_size,
            analyzer=FakeAnalyzer(error=LLMProviderTimeoutError("late")),
        )
    )
    by_id = {item.check_id: item for item in report.findings}
    assert by_id["orientation"].status is PreflightStatus.PASS
    assert by_id["resolution"].status is PreflightStatus.PASS
    assert by_id["audio_track"].status is PreflightStatus.PASS
    assert by_id["speech_activity"].status is PreflightStatus.PASS
    assert by_id["opening"].status is PreflightStatus.NOT_EVALUATED
    assert by_id["cta"].status is PreflightStatus.NOT_EVALUATED
    assert report.summary.not_evaluated == 2
    assert report.speech_segments == ()
