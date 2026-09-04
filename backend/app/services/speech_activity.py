from __future__ import annotations

import math

from app.domain.shortform_speech import SpeechActivity, SpeechActivityConfig


def detect_speech_activity(
    samples: list[float],
    config: SpeechActivityConfig,
    *,
    duration_seconds: float | None = None,
) -> SpeechActivity:
    """Estimate first audio and first sustained voice-like activity from RMS.

    This is an energy estimate, not a speech-versus-music classifier.
    """

    if not samples:
        return SpeechActivity(has_usable_signal=False)

    window_size = max(1, int(config.sample_rate * config.window_seconds))
    audio_start: float | None = None
    run_start: float | None = None
    run_windows = 0
    activity_start: float | None = None
    sample_duration = len(samples) / config.sample_rate
    bound = sample_duration
    if duration_seconds is not None and math.isfinite(duration_seconds) and duration_seconds > 0:
        bound = min(bound, duration_seconds)

    for start in range(0, len(samples), window_size):
        chunk = samples[start : start + window_size]
        if len(chunk) < max(1, window_size // 2):
            break
        rms = math.sqrt(sum(sample * sample for sample in chunk) / len(chunk))
        start_seconds = start / config.sample_rate
        if start_seconds >= bound:
            break
        if rms < config.rms_threshold:
            run_start = None
            run_windows = 0
            continue
        if audio_start is None:
            audio_start = start_seconds
        if run_start is None:
            run_start = start_seconds
            run_windows = 1
        else:
            run_windows += 1
        run_duration = run_windows * config.window_seconds
        if activity_start is None and run_duration + 1e-9 >= config.min_activity_seconds:
            activity_start = run_start

    audio_start = _clamp_timestamp(audio_start, bound)
    activity_start = _clamp_timestamp(activity_start, bound)
    if activity_start is not None and audio_start is None:
        audio_start = activity_start
    if activity_start is not None and activity_start < (audio_start or 0):
        activity_start = audio_start

    return SpeechActivity(
        audio_start_seconds=audio_start,
        activity_start_seconds=activity_start,
        has_usable_signal=activity_start is not None,
    )


def _clamp_timestamp(value: float | None, bound: float) -> float | None:
    if value is None:
        return None
    if value < 0:
        return 0.0
    if value > bound:
        return None
    return value
