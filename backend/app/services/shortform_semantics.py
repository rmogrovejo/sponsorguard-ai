from __future__ import annotations

from app.domain.media import TimeRange
from app.domain.shortform import PreflightCategory, PreflightFinding, PreflightStatus
from app.domain.shortform_speech import (
    CtaDecision,
    GroundedSemanticCheck,
    HookDecision,
    ProviderSpeechSegment,
    ShortFormProviderDocument,
    SpeechClipId,
    SpeechSegment,
)
from app.services.shortform_time import format_clip_timestamp
from app.services.shortform_windows import TIMESTAMP_TOLERANCE_SECONDS

HOOK_STATUS = {
    HookDecision.STRONG: PreflightStatus.PASS,
    HookDecision.REVIEW: PreflightStatus.WARNING,
    HookDecision.WEAK: PreflightStatus.WARNING,
    HookDecision.NOT_EVALUATED: PreflightStatus.NOT_EVALUATED,
}

CTA_STATUS = {
    CtaDecision.FOUND: PreflightStatus.PASS,
    CtaDecision.NOT_FOUND: PreflightStatus.WARNING,
    CtaDecision.REVIEW: PreflightStatus.WARNING,
    CtaDecision.NOT_EVALUATED: PreflightStatus.NOT_EVALUATED,
}

UNAVAILABLE_OPENING_REASON = (
    "Opening could not be evaluated because speech analysis is unavailable."
)
UNAVAILABLE_CTA_REASON = (
    "Call to action could not be evaluated because speech analysis is unavailable."
)


def ground_provider_document(
    document: ShortFormProviderDocument,
    *,
    video_duration_seconds: float,
    opening: TimeRange,
    ending: TimeRange,
    speech_activity_start: float | None,
) -> GroundedSemanticCheck:
    """Validate provider output and resolve evidence from original segments only."""

    segments: list[SpeechSegment] = []
    for item in document.segments:
        grounded = _absolute_segment(item, opening=opening, ending=ending)
        if grounded is None:
            continue
        if grounded.end_seconds > video_duration_seconds + TIMESTAMP_TOLERANCE_SECONDS:
            continue
        if grounded.start_seconds >= video_duration_seconds:
            continue
        segments.append(grounded)

    by_index = {segment.index: segment for segment in segments}
    hook_invented = _indices_invented(document.hook.segment_indices, by_index)
    cta_invented = _indices_invented(document.cta.segment_indices, by_index)
    hook_segment = _first_in_window(document.hook.segment_indices, by_index, opening)
    cta_in_window = _first_in_window(document.cta.segment_indices, by_index, ending)
    cta_cited = _first_cited(document.cta.segment_indices, by_index)

    hook_decision = document.hook.decision
    if hook_invented:
        hook_decision = HookDecision.NOT_EVALUATED
        hook_segment = None
    elif document.hook.decision in {HookDecision.STRONG, HookDecision.REVIEW} and hook_segment is None:
        hook_decision = HookDecision.NOT_EVALUATED

    cta_decision = document.cta.decision
    cta_segment = cta_in_window
    if cta_invented:
        cta_decision = CtaDecision.NOT_EVALUATED
        cta_segment = None
    elif document.cta.decision is CtaDecision.FOUND and cta_in_window is None:
        if cta_cited is not None:
            cta_decision = CtaDecision.NOT_FOUND
            cta_segment = None
        else:
            cta_decision = CtaDecision.NOT_EVALUATED

    hook_delay = None
    if (
        hook_segment is not None
        and speech_activity_start is not None
        and hook_decision is not HookDecision.NOT_EVALUATED
    ):
        hook_delay = max(0.0, hook_segment.start_seconds - speech_activity_start)

    return GroundedSemanticCheck(
        evaluated=True,
        hook_decision=hook_decision,
        cta_decision=cta_decision,
        hook_reason=document.hook.reason,
        cta_reason=document.cta.reason,
        hook_segment=hook_segment if hook_decision is not HookDecision.NOT_EVALUATED else None,
        cta_segment=cta_segment if cta_decision is not CtaDecision.NOT_EVALUATED else None,
        generic_intro=document.hook.generic_intro,
        hook_delay_seconds=hook_delay,
        segments=tuple(segments),
    )


def unevaluated_semantics(reason: str) -> GroundedSemanticCheck:
    return GroundedSemanticCheck(
        evaluated=False,
        hook_decision=HookDecision.NOT_EVALUATED,
        cta_decision=CtaDecision.NOT_EVALUATED,
        hook_reason=reason,
        cta_reason=reason,
        failure_reason=reason,
    )


def opening_finding(check: GroundedSemanticCheck) -> PreflightFinding:
    status = HOOK_STATUS[check.hook_decision]
    if status is PreflightStatus.NOT_EVALUATED:
        return PreflightFinding(
            check_id="opening",
            category=PreflightCategory.OPENING,
            status=PreflightStatus.NOT_EVALUATED,
            title="Opening",
            reason=check.hook_reason or UNAVAILABLE_OPENING_REASON,
        )

    segment = check.hook_segment
    measurements: dict[str, float | int | str] = {
        "hook_decision": check.hook_decision.value,
    }
    ranges: tuple[TimeRange, ...] = ()
    if segment is not None:
        measurements["hook_start_seconds"] = round(segment.start_seconds, 3)
        ranges = (
            TimeRange(start_seconds=segment.start_seconds, end_seconds=segment.end_seconds),
        )
    if check.hook_delay_seconds is not None:
        measurements["hook_delay_seconds"] = round(check.hook_delay_seconds, 3)

    reason = _opening_reason(check, segment)
    recommendation = None
    if status is PreflightStatus.WARNING:
        recommendation = (
            "Establish the viewer-facing subject or payoff earlier in the opening."
        )
    return PreflightFinding(
        check_id="opening",
        category=PreflightCategory.OPENING,
        status=status,
        title="Opening",
        reason=reason,
        recommendation=recommendation,
        evidence_text=segment.text if segment is not None else None,
        ranges=ranges,
        measurements=measurements,
    )


def cta_finding(check: GroundedSemanticCheck) -> PreflightFinding:
    status = CTA_STATUS[check.cta_decision]
    if status is PreflightStatus.NOT_EVALUATED:
        return PreflightFinding(
            check_id="cta",
            category=PreflightCategory.CTA,
            status=PreflightStatus.NOT_EVALUATED,
            title="Call to action",
            reason=check.cta_reason or UNAVAILABLE_CTA_REASON,
        )

    segment = check.cta_segment
    measurements: dict[str, float | int | str] = {
        "cta_decision": check.cta_decision.value,
    }
    ranges: tuple[TimeRange, ...] = ()
    if segment is not None and check.cta_decision is CtaDecision.FOUND:
        measurements["cta_start_seconds"] = round(segment.start_seconds, 3)
        ranges = (
            TimeRange(start_seconds=segment.start_seconds, end_seconds=segment.end_seconds),
        )
        reason = (
            f"Detected at {format_clip_timestamp(segment.start_seconds)}."
        )
        recommendation = None
        evidence = segment.text
    elif check.cta_decision is CtaDecision.REVIEW:
        reason = check.cta_reason
        recommendation = "Consider giving the viewer an explicit next step."
        evidence = segment.text if segment is not None else None
        if segment is not None:
            ranges = (
                TimeRange(start_seconds=segment.start_seconds, end_seconds=segment.end_seconds),
            )
    else:
        reason = "No clear call to action detected near the ending."
        recommendation = "Consider giving the viewer an explicit next step."
        evidence = None

    return PreflightFinding(
        check_id="cta",
        category=PreflightCategory.CTA,
        status=status,
        title="Call to action",
        reason=reason,
        recommendation=recommendation,
        evidence_text=evidence,
        ranges=ranges,
        measurements=measurements,
    )


def _opening_reason(
    check: GroundedSemanticCheck,
    segment: SpeechSegment | None,
) -> str:
    if check.hook_decision is HookDecision.STRONG and segment is not None:
        return (
            f"Clear opening subject at {format_clip_timestamp(segment.start_seconds)}."
        )
    if check.hook_decision is HookDecision.REVIEW and segment is not None:
        delay = check.hook_delay_seconds
        delay_text = (
            f" Hook delay {delay:.1f} sec."
            if delay is not None and delay >= 0.5
            else ""
        )
        if check.generic_intro:
            return (
                f"Main hook detected at {format_clip_timestamp(segment.start_seconds)}."
                f"{delay_text} The video begins with a generic introduction "
                "before establishing the viewer payoff."
            )
        return (
            f"Main hook detected at {format_clip_timestamp(segment.start_seconds)}."
            f"{delay_text}"
        )
    if check.hook_decision is HookDecision.WEAK:
        return (
            "The opening does not present a clear subject, problem, or promise."
        )
    return check.hook_reason


def _absolute_segment(
    item: ProviderSpeechSegment,
    *,
    opening: TimeRange,
    ending: TimeRange,
) -> SpeechSegment | None:
    clip = opening if item.clip_id is SpeechClipId.OPENING else ending
    clip_duration = clip.duration_seconds
    if item.start_seconds < -TIMESTAMP_TOLERANCE_SECONDS:
        return None
    if item.end_seconds > clip_duration + TIMESTAMP_TOLERANCE_SECONDS:
        return None
    start = clip.start_seconds + max(0.0, item.start_seconds)
    end = clip.start_seconds + item.end_seconds
    if end <= start:
        return None
    try:
        return SpeechSegment(
            index=item.index,
            start_seconds=start,
            end_seconds=end,
            text=item.text,
        )
    except ValueError:
        return None


def _first_in_window(
    indices: tuple[int, ...],
    by_index: dict[int, SpeechSegment],
    window: TimeRange,
) -> SpeechSegment | None:
    for index in indices:
        segment = by_index.get(index)
        if segment is not None and _overlaps_window(segment, window):
            return segment
    return None


def _first_cited(
    indices: tuple[int, ...],
    by_index: dict[int, SpeechSegment],
) -> SpeechSegment | None:
    for index in indices:
        segment = by_index.get(index)
        if segment is not None:
            return segment
    return None


def _indices_invented(indices: tuple[int, ...], by_index: dict[int, SpeechSegment]) -> bool:
    return any(index not in by_index for index in indices)


def _overlaps_window(segment: SpeechSegment, window: TimeRange) -> bool:
    return (
        segment.start_seconds < window.end_seconds + TIMESTAMP_TOLERANCE_SECONDS
        and segment.end_seconds > window.start_seconds - TIMESTAMP_TOLERANCE_SECONDS
        and segment.start_seconds >= window.start_seconds - TIMESTAMP_TOLERANCE_SECONDS
    )
