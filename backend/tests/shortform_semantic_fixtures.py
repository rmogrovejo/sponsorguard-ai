from app.domain.media import TimeRange
from app.domain.shortform_speech import (
    CtaDecision,
    HookDecision,
    ProviderCtaResult,
    ProviderHookResult,
    ProviderSpeechSegment,
    ShortFormProviderDocument,
    SpeechClipId,
)


def provider_document(
    *,
    hook_decision: HookDecision = HookDecision.STRONG,
    cta_decision: CtaDecision = CtaDecision.FOUND,
    hook_indices: tuple[int, ...] = (1,),
    cta_indices: tuple[int, ...] = (2,),
    generic_intro: bool = False,
    hook_reason: str = "Clear subject in the opening.",
    cta_reason: str = "Explicit follow request.",
    segments: tuple[ProviderSpeechSegment, ...] | None = None,
) -> ShortFormProviderDocument:
    if segments is None:
        segments = (
            ProviderSpeechSegment(
                index=1,
                clip_id=SpeechClipId.OPENING,
                start_seconds=0.2,
                end_seconds=3.0,
                text="Three settings are destroying your FPS.",
            ),
            ProviderSpeechSegment(
                index=2,
                clip_id=SpeechClipId.ENDING,
                start_seconds=0.4,
                end_seconds=2.0,
                text="Follow for the next part.",
            ),
        )
    return ShortFormProviderDocument(
        segments=segments,
        hook=ProviderHookResult(
            decision=hook_decision,
            segment_indices=hook_indices,
            reason=hook_reason,
            generic_intro=generic_intro,
        ),
        cta=ProviderCtaResult(
            decision=cta_decision,
            segment_indices=cta_indices,
            reason=cta_reason,
        ),
    )


OPENING = TimeRange(start_seconds=0.0, end_seconds=8.0)
ENDING = TimeRange(start_seconds=24.0, end_seconds=30.0)
VIDEO_DURATION = 30.0
