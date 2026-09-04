from pathlib import Path

import pytest

from app.domain.shortform import DEFAULT_SILENCE_ANALYSIS
from app.domain.shortform_speech import DEFAULT_SPEECH_ACTIVITY, SPEECH_ACTIVITY_LABEL
from app.services.media_inspection import inspect_audio_file
from app.services.speech_activity import detect_speech_activity
from tests.media_fixtures import write_test_mp4


def _tone(seconds: float, *, amplitude: float = 0.28) -> list[float]:
    rate = DEFAULT_SPEECH_ACTIVITY.sample_rate
    return [amplitude] * int(seconds * rate)


def test_speech_activity_timestamp_is_valid_and_bounded() -> None:
    rate = DEFAULT_SPEECH_ACTIVITY.sample_rate
    samples = [0.0] * int(0.75 * rate) + _tone(1.2)
    activity = detect_speech_activity(samples, DEFAULT_SPEECH_ACTIVITY, duration_seconds=2.0)

    assert activity.has_usable_signal is True
    assert activity.audio_start_seconds == pytest.approx(0.75, abs=0.3)
    assert activity.activity_start_seconds == pytest.approx(0.75, abs=0.3)
    assert activity.activity_start_seconds is not None
    assert 0 <= activity.activity_start_seconds <= 2.0
    assert activity.label == SPEECH_ACTIVITY_LABEL


def test_no_audio_samples_are_not_a_usable_signal() -> None:
    activity = detect_speech_activity([], DEFAULT_SPEECH_ACTIVITY)
    assert activity.has_usable_signal is False
    assert activity.audio_start_seconds is None
    assert activity.activity_start_seconds is None


def test_silent_audio_has_no_usable_speech_signal() -> None:
    samples = [0.0] * DEFAULT_SPEECH_ACTIVITY.sample_rate * 3
    activity = detect_speech_activity(samples, DEFAULT_SPEECH_ACTIVITY)
    assert activity.has_usable_signal is False
    assert activity.audio_start_seconds is None


def test_short_natural_pauses_do_not_create_false_activity_start() -> None:
    rate = DEFAULT_SPEECH_ACTIVITY.sample_rate
    samples = _tone(0.8) + [0.0] * int(0.3 * rate) + _tone(0.8)
    activity = detect_speech_activity(samples, DEFAULT_SPEECH_ACTIVITY)
    assert activity.has_usable_signal is True
    assert activity.activity_start_seconds == pytest.approx(0.0, abs=0.3)


def test_brief_click_is_audio_without_sustained_speech() -> None:
    rate = DEFAULT_SPEECH_ACTIVITY.sample_rate
    samples = _tone(0.2) + [0.0] * int(2.0 * rate)
    activity = detect_speech_activity(samples, DEFAULT_SPEECH_ACTIVITY)
    assert activity.audio_start_seconds == pytest.approx(0.0, abs=0.3)
    assert activity.has_usable_signal is False
    assert activity.activity_start_seconds is None


def test_activity_timestamp_cannot_pass_duration_bound() -> None:
    samples = [0.0] * int(1.5 * DEFAULT_SPEECH_ACTIVITY.sample_rate) + _tone(1.0)
    activity = detect_speech_activity(samples, DEFAULT_SPEECH_ACTIVITY, duration_seconds=1.2)
    assert activity.has_usable_signal is False


def test_inspect_audio_reuses_one_decode_for_silence_and_speech(tmp_path: Path) -> None:
    path = write_test_mp4(
        tmp_path / "gap.mp4",
        width=160,
        height=284,
        duration_seconds=4.0,
        silence_ranges=((1.2, 3.4),),
    )
    inspection = inspect_audio_file(
        path,
        silence=DEFAULT_SILENCE_ANALYSIS,
        speech=DEFAULT_SPEECH_ACTIVITY,
        duration_seconds=4.0,
    )
    assert inspection.activity.has_usable_signal is True
    assert inspection.silence_ranges
    assert inspection.sample_rate == DEFAULT_SILENCE_ANALYSIS.sample_rate
