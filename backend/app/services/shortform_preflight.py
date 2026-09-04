from collections.abc import Iterable
from pathlib import Path

from app.domain.media import MediaInspection, TimeRange, aspect_ratio_matches
from app.domain.shortform import (
    PLATFORM_PROFILES,
    PlatformProfile,
    PreflightCategory,
    PreflightFinding,
    PreflightStatus,
    ShortFormPlatform,
    ShortFormReport,
    get_platform_profile,
    summarize_preflight,
)
from app.services.media_errors import MediaInspectionError
from app.services.media_inspection import detect_low_energy_intervals, inspect_video_file


def analyze_shortform_video(
    path: Path,
    *,
    platform: ShortFormPlatform,
    display_filename: str,
    size_bytes: int,
) -> ShortFormReport:
    profile = get_platform_profile(platform)
    media = inspect_video_file(
        path,
        display_filename=display_filename,
        size_bytes=size_bytes,
    )
    silence_ranges, audio_status = _safe_silence_ranges(path, media, profile)
    findings = (
        _video_present_finding(media),
        _orientation_finding(media, profile),
        _resolution_finding(media, profile),
        _duration_finding(media, profile),
        _audio_track_finding(media),
        _dead_air_finding(media, silence_ranges, audio_status),
    )
    return ShortFormReport(
        platform=platform,
        media=media,
        summary=summarize_preflight(findings),
        findings=findings,
    )


def parse_platform(value: str) -> ShortFormPlatform:
    try:
        return ShortFormPlatform(value)
    except ValueError as error:
        raise ValueError(f"Unsupported short-form platform: {value}") from error


def _safe_silence_ranges(
    path: Path,
    media: MediaInspection,
    profile: PlatformProfile,
) -> tuple[tuple[TimeRange, ...], PreflightStatus | None]:
    if not media.has_audio:
        return (), None
    try:
        return detect_low_energy_intervals(path, config=profile.silence), None
    except MediaInspectionError:
        return (), PreflightStatus.NOT_EVALUATED


def _video_present_finding(media: MediaInspection) -> PreflightFinding:
    return PreflightFinding(
        check_id="video_present",
        category=PreflightCategory.MEDIA,
        status=PreflightStatus.PASS,
        title="Video present",
        reason="The uploaded file decoded as a video stream.",
        measurements={
            "width": media.width,
            "height": media.height,
            "duration_seconds": round(media.duration_seconds, 3),
        },
    )


def _orientation_finding(
    media: MediaInspection,
    profile: PlatformProfile,
) -> PreflightFinding:
    matches = aspect_ratio_matches(
        media.aspect_ratio,
        profile.target_aspect_ratio,
        tolerance=profile.aspect_tolerance,
    )
    measurements = {
        "width": media.width,
        "height": media.height,
        "aspect_ratio": round(media.aspect_ratio, 4),
        "orientation": media.orientation.value,
    }
    if matches:
        return PreflightFinding(
            check_id="orientation",
            category=PreflightCategory.FORMAT,
            status=PreflightStatus.PASS,
            title="Orientation",
            reason=f"9:16 portrait frame detected ({media.width} × {media.height}).",
            measurements=measurements,
        )
    if media.orientation.value == "landscape":
        return PreflightFinding(
            check_id="orientation",
            category=PreflightCategory.FORMAT,
            status=PreflightStatus.FAIL,
            title="Orientation",
            reason=(
                f"Landscape {media.width} × {media.height} is not a preferred "
                f"vertical frame for {profile.label}."
            ),
            recommendation="Export a 9:16 portrait frame before publishing.",
            measurements=measurements,
        )
    return PreflightFinding(
        check_id="orientation",
        category=PreflightCategory.FORMAT,
        status=PreflightStatus.WARNING,
        title="Orientation",
        reason=(
            f"{media.orientation.value.title()} {media.width} × {media.height} "
            f"is outside the preferred 9:16 portrait window."
        ),
        recommendation="Review whether this crop will fill a vertical short-form player.",
        measurements=measurements,
    )


def _resolution_finding(
    media: MediaInspection,
    profile: PlatformProfile,
) -> PreflightFinding:
    measurements = {"width": media.width, "height": media.height}
    meets_hd = (
        media.width >= profile.preferred_min_width
        and media.height >= profile.preferred_min_height
    )
    if meets_hd:
        return PreflightFinding(
            check_id="resolution",
            category=PreflightCategory.FORMAT,
            status=PreflightStatus.PASS,
            title="Resolution",
            reason="Vertical HD frame detected.",
            measurements=measurements,
        )
    return PreflightFinding(
        check_id="resolution",
        category=PreflightCategory.FORMAT,
        status=PreflightStatus.WARNING,
        title="Resolution",
        reason="Resolution is below the preferred vertical HD target.",
        recommendation=(
            f"Prefer at least {profile.preferred_min_width} × "
            f"{profile.preferred_min_height} for {profile.label}."
        ),
        measurements=measurements,
    )


def _duration_finding(
    media: MediaInspection,
    profile: PlatformProfile,
) -> PreflightFinding:
    duration = media.duration_seconds
    measurements = {"duration_seconds": round(duration, 3)}
    if duration < profile.min_duration_seconds:
        return PreflightFinding(
            check_id="duration",
            category=PreflightCategory.FORMAT,
            status=PreflightStatus.FAIL,
            title="Duration",
            reason=(
                f"The clip is {duration:.2f}s, shorter than the preferred "
                f"{profile.min_duration_seconds:.0f}s minimum."
            ),
            recommendation="Extend the clip so it can hold a complete short-form beat.",
            measurements=measurements,
        )
    if duration > profile.max_duration_seconds:
        return PreflightFinding(
            check_id="duration",
            category=PreflightCategory.FORMAT,
            status=PreflightStatus.FAIL,
            title="Duration",
            reason=(
                f"The clip is {duration:.2f}s, longer than the {profile.label} "
                f"preflight window of {profile.max_duration_seconds:.0f}s."
            ),
            recommendation="Trim the clip to the preferred short-form length.",
            measurements=measurements,
        )
    if duration > profile.preferred_max_duration_seconds:
        return PreflightFinding(
            check_id="duration",
            category=PreflightCategory.FORMAT,
            status=PreflightStatus.WARNING,
            title="Duration",
            reason=(
                f"The clip is {duration:.2f}s, longer than the preferred "
                f"{profile.preferred_max_duration_seconds:.0f}s {profile.label} window."
            ),
            recommendation="Consider a tighter cut for the first viewport.",
            measurements=measurements,
        )
    return PreflightFinding(
        check_id="duration",
        category=PreflightCategory.FORMAT,
        status=PreflightStatus.PASS,
        title="Duration",
        reason=f"Duration {duration:.2f}s is within the preferred {profile.label} window.",
        measurements=measurements,
    )


def _audio_track_finding(media: MediaInspection) -> PreflightFinding:
    if media.has_audio:
        return PreflightFinding(
            check_id="audio_track",
            category=PreflightCategory.AUDIO,
            status=PreflightStatus.PASS,
            title="Audio",
            reason="Audio track detected.",
        )
    return PreflightFinding(
        check_id="audio_track",
        category=PreflightCategory.AUDIO,
        status=PreflightStatus.WARNING,
        title="Audio",
        reason="No audio track was found.",
        recommendation="Add an audio track if the published cut should include sound.",
    )


def _dead_air_finding(
    media: MediaInspection,
    ranges: tuple[TimeRange, ...],
    audio_status: PreflightStatus | None,
) -> PreflightFinding:
    if not media.has_audio:
        return PreflightFinding(
            check_id="dead_air",
            category=PreflightCategory.PACING,
            status=PreflightStatus.NOT_EVALUATED,
            title="Pacing",
            reason="Pacing could not be evaluated because no audio track is present.",
        )
    if audio_status is PreflightStatus.NOT_EVALUATED:
        return PreflightFinding(
            check_id="dead_air",
            category=PreflightCategory.PACING,
            status=PreflightStatus.NOT_EVALUATED,
            title="Pacing",
            reason="Pacing could not be evaluated because audio decoding failed.",
        )
    if not ranges:
        return PreflightFinding(
            check_id="dead_air",
            category=PreflightCategory.PACING,
            status=PreflightStatus.PASS,
            title="Pacing",
            reason="No extended low-energy interval was detected.",
        )
    first = ranges[0]
    extra = f" {len(ranges)} intervals found." if len(ranges) > 1 else ""
    return PreflightFinding(
        check_id="dead_air",
        category=PreflightCategory.PACING,
        status=PreflightStatus.WARNING,
        title="Pacing review",
        reason=(
            f"{first.duration_seconds:.2f} sec low-energy interval."
            f"{extra}"
        ),
        recommendation="Review this pacing gap before publishing.",
        ranges=ranges,
        measurements={
            "interval_count": len(ranges),
            "longest_seconds": round(
                max(item.duration_seconds for item in ranges),
                3,
            ),
        },
    )


def platform_choices() -> Iterable[PlatformProfile]:
    return PLATFORM_PROFILES.values()
