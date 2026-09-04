from app.domain.shortform import (
    PLATFORM_PROFILES,
    PreflightCategory,
    PreflightFinding,
    PreflightStatus,
    ShortFormPlatform,
    summarize_preflight,
)


def test_platform_profiles_keep_duration_rules_centralized() -> None:
    tiktok = PLATFORM_PROFILES[ShortFormPlatform.TIKTOK]
    shorts = PLATFORM_PROFILES[ShortFormPlatform.YOUTUBE_SHORTS]
    reels = PLATFORM_PROFILES[ShortFormPlatform.INSTAGRAM_REELS]

    assert tiktok.target_aspect_ratio == 9 / 16
    assert shorts.max_duration_seconds == 60
    assert reels.preferred_max_duration_seconds == 90
    assert tiktok.silence.min_silence_seconds == 1.8
    assert tiktok.silence.window_seconds == 0.25


def test_readiness_score_reuses_pass_warning_formula() -> None:
    findings = (
        PreflightFinding(
            check_id="video_present",
            category=PreflightCategory.MEDIA,
            status=PreflightStatus.PASS,
            title="Video present",
            reason="Decoded.",
        ),
        PreflightFinding(
            check_id="orientation",
            category=PreflightCategory.FORMAT,
            status=PreflightStatus.PASS,
            title="Orientation",
            reason="Portrait.",
        ),
        PreflightFinding(
            check_id="dead_air",
            category=PreflightCategory.PACING,
            status=PreflightStatus.WARNING,
            title="Pacing",
            reason="Gap.",
        ),
        PreflightFinding(
            check_id="audio_track",
            category=PreflightCategory.AUDIO,
            status=PreflightStatus.NOT_EVALUATED,
            title="Audio",
            reason="Unavailable.",
        ),
    )

    summary = summarize_preflight(findings)

    assert summary.total == 4
    assert summary.evaluated == 3
    assert summary.passed == 2
    assert summary.warnings == 1
    assert summary.failed == 0
    assert summary.readiness_score == 83.33
    assert summary.verification_coverage == 75.0
