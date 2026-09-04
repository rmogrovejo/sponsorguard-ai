import logging
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
from app.domain.shortform_speech import (
    DEFAULT_SPEECH_ACTIVITY,
    GroundedSemanticCheck,
    SPEECH_ACTIVITY_LABEL,
    SpeechActivity,
)
from app.integrations.llm.base import ShortFormSemanticAnalyzer
from app.integrations.llm.exceptions import LLMProviderError
from app.integrations.llm.shortform_request import ShortFormSemanticRequest
from app.services.audio_wav import encode_pcm16_wav, slice_samples
from app.services.media_errors import MediaInspectionError
from app.services.media_inspection import AudioInspection, inspect_audio_file, inspect_video_file
from app.services.shortform_priorities import build_review_priorities
from app.services.shortform_semantics import (
    cta_finding,
    ground_provider_document,
    opening_finding,
    unevaluated_semantics,
)
from app.services.shortform_time import format_clip_timestamp
from app.services.shortform_windows import (
    ending_contained_in_opening,
    ending_window,
    opening_window,
)

logger = logging.getLogger("sponsorguard")


def analyze_shortform_video(
    path: Path,
    *,
    platform: ShortFormPlatform,
    display_filename: str,
    size_bytes: int,
    semantic: GroundedSemanticCheck | None = None,
) -> ShortFormReport:
    profile = get_platform_profile(platform)
    media = inspect_video_file(
        path,
        display_filename=display_filename,
        size_bytes=size_bytes,
    )
    audio, audio_status = _safe_audio_inspection(path, media, profile)
    return assemble_shortform_report(
        platform=platform,
        media=media,
        audio=audio,
        audio_status=audio_status,
        semantic=semantic,
    )


async def run_shortform_preflight(
    path: Path,
    *,
    platform: ShortFormPlatform,
    display_filename: str,
    size_bytes: int,
    analyzer: ShortFormSemanticAnalyzer | None,
) -> ShortFormReport:
    profile = get_platform_profile(platform)
    media = inspect_video_file(
        path,
        display_filename=display_filename,
        size_bytes=size_bytes,
    )
    audio, audio_status = _safe_audio_inspection(path, media, profile)
    semantic = await _analyze_semantics(
        media,
        audio,
        analyzer,
    )
    return assemble_shortform_report(
        platform=platform,
        media=media,
        audio=audio,
        audio_status=audio_status,
        semantic=semantic,
    )


def assemble_shortform_report(
    *,
    platform: ShortFormPlatform,
    media: MediaInspection,
    audio: AudioInspection | None,
    audio_status: PreflightStatus | None,
    semantic: GroundedSemanticCheck | None,
) -> ShortFormReport:
    profile = get_platform_profile(platform)
    activity = audio.activity if audio is not None else None
    silence_ranges = audio.silence_ranges if audio is not None else ()
    if semantic is None:
        semantic = unevaluated_semantics(
            "Opening and call to action were not evaluated."
        )
    findings = (
        _video_present_finding(media),
        _orientation_finding(media, profile),
        _resolution_finding(media, profile),
        _duration_finding(media, profile),
        _audio_track_finding(media),
        _speech_activity_finding(media, activity, audio_status),
        opening_finding(semantic),
        _dead_air_finding(media, silence_ranges, audio_status),
        cta_finding(semantic),
    )
    return ShortFormReport(
        platform=platform,
        media=media,
        summary=summarize_preflight(findings),
        findings=findings,
        speech=activity,
        speech_segments=semantic.segments,
        priorities=build_review_priorities(findings),
    )


def parse_platform(value: str) -> ShortFormPlatform:
    try:
        return ShortFormPlatform(value)
    except ValueError as error:
        raise ValueError(f"Unsupported short-form platform: {value}") from error


def _safe_audio_inspection(
    path: Path,
    media: MediaInspection,
    profile: PlatformProfile,
) -> tuple[AudioInspection | None, PreflightStatus | None]:
    if not media.has_audio:
        return None, None
    try:
        return (
            inspect_audio_file(
                path,
                silence=profile.silence,
                speech=DEFAULT_SPEECH_ACTIVITY,
                duration_seconds=media.duration_seconds,
            ),
            None,
        )
    except MediaInspectionError:
        return None, PreflightStatus.NOT_EVALUATED


async def _analyze_semantics(
    media: MediaInspection,
    audio: AudioInspection | None,
    analyzer: ShortFormSemanticAnalyzer | None,
) -> GroundedSemanticCheck:
    if audio is None or not audio.activity.has_usable_signal:
        return unevaluated_semantics(
            "Opening and call to action could not be evaluated because no usable "
            "speech activity was detected."
        )
    if analyzer is None:
        return unevaluated_semantics(
            "Opening and call to action could not be evaluated because speech "
            "analysis is not configured."
        )

    opening = opening_window(media.duration_seconds)
    ending = ending_window(media.duration_seconds)
    opening_audio = encode_pcm16_wav(
        slice_samples(
            audio.samples,
            audio.sample_rate,
            opening.start_seconds,
            opening.end_seconds,
        ),
        audio.sample_rate,
    )
    ending_audio = None
    if not ending_contained_in_opening(opening, ending):
        ending_audio = encode_pcm16_wav(
            slice_samples(
                audio.samples,
                audio.sample_rate,
                ending.start_seconds,
                ending.end_seconds,
            ),
            audio.sample_rate,
        )
    if len(opening_audio) < 44:
        return unevaluated_semantics(
            "Opening and call to action could not be evaluated because no usable "
            "speech activity was detected."
        )

    try:
        document = await analyzer.analyze_shortform(
            ShortFormSemanticRequest(
                opening=opening,
                ending=ending,
                video_duration_seconds=media.duration_seconds,
                opening_audio=opening_audio,
                ending_audio=ending_audio,
            )
        )
    except LLMProviderError as error:
        logger.info(
            "shortform semantic analysis unavailable",
            extra={
                "event": "shortform_semantic_failed",
                "error_type": type(error).__name__,
            },
        )
        return unevaluated_semantics(
            "Opening and call to action could not be evaluated because the "
            "language-model provider failed."
        )
    except Exception as error:
        logger.info(
            "shortform semantic analysis unavailable",
            extra={
                "event": "shortform_semantic_failed",
                "error_type": type(error).__name__,
            },
        )
        return unevaluated_semantics(
            "Opening and call to action could not be evaluated because the "
            "language-model provider failed."
        )

    try:
        return ground_provider_document(
            document,
            video_duration_seconds=media.duration_seconds,
            opening=opening,
            ending=ending,
            speech_activity_start=audio.activity.activity_start_seconds,
        )
    except Exception as error:
        logger.info(
            "shortform semantic grounding failed",
            extra={
                "event": "shortform_semantic_failed",
                "error_type": type(error).__name__,
            },
        )
        return unevaluated_semantics(
            "Opening and call to action could not be evaluated because the "
            "provider returned invalid output."
        )


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
            "is outside the preferred 9:16 portrait window."
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


def _speech_activity_finding(
    media: MediaInspection,
    activity: SpeechActivity | None,
    audio_status: PreflightStatus | None,
) -> PreflightFinding:
    if not media.has_audio:
        return PreflightFinding(
            check_id="speech_activity",
            category=PreflightCategory.SPEECH,
            status=PreflightStatus.NOT_EVALUATED,
            title="Speech",
            reason="Speech activity could not be evaluated because no audio track is present.",
        )
    if audio_status is PreflightStatus.NOT_EVALUATED or activity is None:
        return PreflightFinding(
            check_id="speech_activity",
            category=PreflightCategory.SPEECH,
            status=PreflightStatus.NOT_EVALUATED,
            title="Speech",
            reason="Speech activity could not be evaluated because audio decoding failed.",
        )
    measurements: dict[str, float | int | str] = {
        "method": activity.method.value,
        "label": activity.label,
    }
    if activity.audio_start_seconds is not None:
        measurements["audio_start_seconds"] = round(activity.audio_start_seconds, 3)
    if activity.activity_start_seconds is not None:
        measurements["activity_start_seconds"] = round(activity.activity_start_seconds, 3)
    if activity.has_usable_signal and activity.activity_start_seconds is not None:
        stamp = format_clip_timestamp(activity.activity_start_seconds)
        return PreflightFinding(
            check_id="speech_activity",
            category=PreflightCategory.SPEECH,
            status=PreflightStatus.PASS,
            title="Speech",
            reason=(
                f"{SPEECH_ACTIVITY_LABEL} {stamp}. "
                "This is an energy-based estimate of first sustained voice-like "
                "activity. It does not separate speech from music."
            ),
            measurements=measurements,
        )
    if activity.audio_start_seconds is not None:
        return PreflightFinding(
            check_id="speech_activity",
            category=PreflightCategory.SPEECH,
            status=PreflightStatus.WARNING,
            title="Speech",
            reason=(
                "Audio energy was detected, but no sustained voice-like activity "
                "could be measured."
            ),
            measurements=measurements,
        )
    return PreflightFinding(
        check_id="speech_activity",
        category=PreflightCategory.SPEECH,
        status=PreflightStatus.WARNING,
        title="Speech",
        reason="No usable speech activity signal was measured.",
        measurements=measurements,
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
