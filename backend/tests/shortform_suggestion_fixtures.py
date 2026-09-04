from app.domain.media import TimeRange
from app.domain.shortform import PreflightCategory, PreflightFinding, PreflightStatus
from app.domain.shortform_speech import SpeechSegment
from app.domain.shortform_suggestions import (
    ShortFormSuggestionProviderOutput,
    SuggestionOutcome,
)


def opening_finding(
    *,
    status: PreflightStatus = PreflightStatus.WARNING,
    reason: str = "The viewer payoff arrives after a generic introduction.",
    evidence: str | None = (
        "Hey guys, welcome back to another video. Today I'm going to show you "
        "three settings."
    ),
    start: float = 0.0,
    end: float = 3.2,
) -> PreflightFinding:
    ranges = ()
    if status is not PreflightStatus.NOT_EVALUATED and start is not None:
        ranges = (TimeRange(start_seconds=start, end_seconds=end),)
    return PreflightFinding(
        check_id="opening",
        category=PreflightCategory.OPENING,
        status=status,
        title="Opening",
        reason=reason,
        recommendation=(
            "Establish the viewer-facing subject or payoff earlier in the opening."
            if status is PreflightStatus.WARNING
            else None
        ),
        evidence_text=evidence if status is not PreflightStatus.NOT_EVALUATED else None,
        ranges=ranges,
        measurements={"hook_decision": "review"} if status is PreflightStatus.WARNING else None,
    )


def cta_finding(
    *,
    status: PreflightStatus = PreflightStatus.WARNING,
    reason: str = "No clear call to action detected near the ending.",
    evidence: str | None = None,
    ranges: tuple[TimeRange, ...] = (),
) -> PreflightFinding:
    return PreflightFinding(
        check_id="cta",
        category=PreflightCategory.CTA,
        status=status,
        title="Call to action",
        reason=reason,
        recommendation=(
            "Consider giving the viewer an explicit next step."
            if status is PreflightStatus.WARNING
            else None
        ),
        evidence_text=evidence,
        ranges=ranges,
        measurements={"cta_decision": "not_found"} if status is PreflightStatus.WARNING else None,
    )


def segment(
    index: int,
    start: float,
    end: float,
    text: str,
) -> SpeechSegment:
    return SpeechSegment(
        index=index,
        start_seconds=start,
        end_seconds=end,
        text=text,
    )


OPENING_SEGMENTS = (
    segment(
        1,
        0.0,
        3.2,
        "Hey guys, welcome back to another video. Today I'm going to show you three settings that are slowing down your PC.",
    ),
    segment(2, 24.0, 26.0, "And that's the third setting."),
)

CTA_SEGMENTS = (
    segment(
        1,
        0.2,
        3.0,
        "Hey guys, welcome back to another video. Today I'm going to show you three settings.",
    ),
    segment(2, 24.1, 26.4, "And that's the third setting."),
)


def provider_output(
    *,
    text: str = "Three settings are slowing down your PC, and one may already be enabled.",
    reason: str = "The opening spends time on a generic introduction.",
    indices: tuple[int, ...] = (1,),
    outcome: SuggestionOutcome = SuggestionOutcome.SUGGESTED,
) -> ShortFormSuggestionProviderOutput:
    return ShortFormSuggestionProviderOutput(
        outcome=outcome,
        suggested_text=text if outcome is SuggestionOutcome.SUGGESTED else None,
        reason=reason,
        referenced_segment_indices=indices,
    )


class FakeSuggestionGenerator:
    def __init__(
        self,
        output: ShortFormSuggestionProviderOutput | Exception,
    ) -> None:
        self.output = output
        self.calls = 0
        self.contexts: list[object] = []

    @property
    def provider_name(self) -> str:
        return "fake"

    @property
    def model_name(self) -> str:
        return "fake-model"

    async def generate_suggestion(self, context: object) -> ShortFormSuggestionProviderOutput:
        self.calls += 1
        self.contexts.append(context)
        if isinstance(self.output, Exception):
            raise self.output
        return self.output
