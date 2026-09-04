import pytest
from pydantic import ValidationError

from app.domain.shortform_speech import (
    CtaDecision,
    HookDecision,
    ProviderHookResult,
    ProviderSpeechSegment,
    ShortFormProviderDocument,
    SpeechActivity,
    SpeechClipId,
    SpeechSegment,
)
from app.services.shortform_windows import ending_window, opening_window


def test_valid_speech_segment() -> None:
    segment = SpeechSegment(
        index=1,
        start_seconds=0.7,
        end_seconds=3.2,
        text="You're making this editing mistake every day.",
    )
    assert segment.text.startswith("You're making")


def test_invalid_timestamp_is_rejected() -> None:
    with pytest.raises(ValidationError):
        SpeechSegment(index=1, start_seconds=3.2, end_seconds=0.7, text="Later first.")


def test_timestamp_beyond_clip_is_rejected_on_provider_segment() -> None:
    with pytest.raises(ValidationError):
        ProviderSpeechSegment(
            index=1,
            clip_id=SpeechClipId.OPENING,
            start_seconds=0.0,
            end_seconds=0.0,
            text="Empty range.",
        )


def test_malformed_provider_output_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        ShortFormProviderDocument.model_validate(
            {
                "segments": [],
                "hook": {
                    "decision": "strong",
                    "segment_indices": [],
                    "reason": "Clear.",
                    "virality": 92,
                },
                "cta": {"decision": "not_found", "segment_indices": [], "reason": "None."},
            }
        )


def test_invalid_decision_enum_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ProviderHookResult(decision="excellent", segment_indices=(), reason="No.")


def test_speech_activity_cannot_claim_usable_signal_without_timestamp() -> None:
    with pytest.raises(ValidationError):
        SpeechActivity(has_usable_signal=True, activity_start_seconds=None)


def test_opening_and_ending_windows_are_documented() -> None:
    opening = opening_window(30.0)
    ending = ending_window(30.0)
    assert opening.start_seconds == 0.0
    assert opening.end_seconds == 8.0
    assert ending.start_seconds == pytest.approx(24.0)
    assert ending.duration_seconds == pytest.approx(6.0)


def test_short_clip_windows_cover_the_full_duration() -> None:
    opening = opening_window(4.0)
    ending = ending_window(4.0)
    assert opening.end_seconds == 4.0
    assert ending.start_seconds == pytest.approx(1.0)
    assert ending.end_seconds == 4.0
    tiny = ending_window(2.0)
    assert tiny.start_seconds == 0.0
    assert tiny.end_seconds == 2.0


def test_provider_json_coerces_clip_and_decision_enums() -> None:
    document = ShortFormProviderDocument.model_validate_json(
        '{"segments":[{"index":1,"clip_id":"opening","start_seconds":0.2,'
        '"end_seconds":1.4,"text":"Three settings."}],'
        '"hook":{"decision":"strong","segment_indices":[1],"reason":"Clear subject."},'
        '"cta":{"decision":"not_found","segment_indices":[],"reason":"No ask."}}'
    )
    assert document.segments[0].clip_id is SpeechClipId.OPENING
    assert document.hook.decision is HookDecision.STRONG


def test_hook_and_cta_decision_values_stay_stable() -> None:
    assert HookDecision.STRONG == "strong"
    assert CtaDecision.NOT_FOUND == "not_found"
