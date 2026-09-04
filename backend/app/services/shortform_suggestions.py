from __future__ import annotations

import re
from collections.abc import Sequence
from enum import StrEnum

from app.domain.media import TimeRange
from app.domain.shortform import PreflightFinding, PreflightStatus, ShortFormPlatform
from app.domain.shortform_speech import SpeechSegment
from app.domain.shortform_suggestions import (
    MAX_SUGGESTED_TEXT_CHARACTERS,
    ShortFormSuggestion,
    ShortFormSuggestionContext,
    ShortFormSuggestionPlacement,
    ShortFormSuggestionProviderOutput,
    SuggestionOutcome,
    SuggestionPlacementStrategy,
    SuggestionType,
    suggestion_display_label,
    suggestion_type_for_finding,
)
from app.domain.text import normalize_for_matching, normalize_unicode_whitespace
from app.integrations.llm.base import ShortFormSuggestionGenerator
from app.integrations.llm.exceptions import LLMOutputValidationError
from app.services.shortform_windows import ending_window, opening_window, windows_overlap


MAX_SUGGESTION_CONTEXT_SEGMENTS = 8
MIN_CONTEXT_CHARACTERS = 12

_URL_PATTERN = re.compile(
    r"(https?://|www\.)|[a-z0-9.-]+\.(com|net|org|io|co|ly|link)\b",
    re.IGNORECASE,
)
_COUPON_PATTERN = re.compile(
    r"\b(coupon|promo code|discount code|use code|code:\s*[a-z0-9]+)\b",
    re.IGNORECASE,
)
_STATISTIC_PATTERN = re.compile(
    r"\b\d{1,3}\s*%\b|\b\d+\s+percent\b|\b99%\s+of\b",
    re.IGNORECASE,
)
_GUARANTEE_PATTERN = re.compile(
    r"\bguaranteed?\b|change your life|you won'?t believe|this will change",
    re.IGNORECASE,
)
_CLICKBAIT_PATTERN = re.compile(
    r"you won'?t believe|this will change your life|99%\s+of people",
    re.IGNORECASE,
)
_UNSUPPORTED_PROMO_PATTERN = re.compile(
    r"\b(gambling|casino|crypto(?:currency)?|bitcoin|brand partnership|sponsored by)\b",
    re.IGNORECASE,
)


class SuggestionInputErrorCode(StrEnum):
    INELIGIBLE_FINDING = "ineligible_finding"
    FINDING_MISMATCH = "finding_mismatch"
    UNSUPPORTED_FINDING = "unsupported_finding"


class SuggestionInputError(ValueError):
    def __init__(self, message: str, *, code: SuggestionInputErrorCode) -> None:
        self.code = code
        super().__init__(message)


def is_suggestion_eligible(finding: PreflightFinding) -> bool:
    if suggestion_type_for_finding(finding) is None:
        return False
    return finding.status is PreflightStatus.WARNING


def require_suggestion_eligibility(
    finding: PreflightFinding,
    *,
    finding_id: SuggestionType,
) -> SuggestionType:
    suggestion_type = suggestion_type_for_finding(finding)
    if suggestion_type is None:
        raise SuggestionInputError(
            "Only opening and CTA findings can receive a suggestion.",
            code=SuggestionInputErrorCode.UNSUPPORTED_FINDING,
        )
    if suggestion_type is not finding_id:
        raise SuggestionInputError(
            "The requested suggestion does not match this finding.",
            code=SuggestionInputErrorCode.FINDING_MISMATCH,
        )
    if not is_suggestion_eligible(finding):
        raise SuggestionInputError(
            "This finding is not eligible for a suggestion.",
            code=SuggestionInputErrorCode.INELIGIBLE_FINDING,
        )
    return suggestion_type


def bound_suggestion_segments(
    finding: PreflightFinding,
    segments: Sequence[SpeechSegment],
    *,
    video_duration_seconds: float,
) -> tuple[SpeechSegment, ...]:
    suggestion_type = suggestion_type_for_finding(finding)
    if suggestion_type is None:
        return ()
    window = (
        opening_window(video_duration_seconds)
        if suggestion_type is SuggestionType.OPENING
        else ending_window(video_duration_seconds)
    )
    selected: list[SpeechSegment] = []
    seen: set[int] = set()
    for segment in segments:
        if segment.index in seen:
            continue
        span = TimeRange(
            start_seconds=segment.start_seconds,
            end_seconds=segment.end_seconds,
        )
        in_window = windows_overlap(span, window)
        in_finding = any(windows_overlap(span, item) for item in finding.ranges)
        if in_window or in_finding:
            selected.append(segment)
            seen.add(segment.index)
        if len(selected) >= MAX_SUGGESTION_CONTEXT_SEGMENTS:
            break
    return tuple(selected)


def context_source_text(context: ShortFormSuggestionContext) -> str:
    parts = [segment.text for segment in context.segments]
    if context.evidence_text:
        parts.append(context.evidence_text)
    return normalize_unicode_whitespace(" ".join(parts))


def has_sufficient_suggestion_context(context: ShortFormSuggestionContext) -> bool:
    return len(context_source_text(context)) >= MIN_CONTEXT_CHARACTERS


def resolve_suggestion_placement(
    context: ShortFormSuggestionContext,
) -> ShortFormSuggestionPlacement:
    if context.suggestion_type is SuggestionType.OPENING:
        return _opening_placement(context)
    return _cta_placement(context)


def build_suggestion_context(
    finding: PreflightFinding,
    segments: Sequence[SpeechSegment],
    *,
    finding_id: SuggestionType,
    platform: ShortFormPlatform,
    video_duration_seconds: float,
) -> ShortFormSuggestionContext:
    suggestion_type = require_suggestion_eligibility(finding, finding_id=finding_id)
    bounded = bound_suggestion_segments(
        finding,
        segments,
        video_duration_seconds=video_duration_seconds,
    )
    return ShortFormSuggestionContext(
        suggestion_type=suggestion_type,
        platform=platform,
        finding_status=finding.status,
        finding_reason=finding.reason,
        segments=bounded,
        evidence_text=finding.evidence_text,
        finding_ranges=finding.ranges,
        video_duration_seconds=video_duration_seconds,
    )


def manual_review_suggestion(
    context: ShortFormSuggestionContext,
    *,
    reason: str,
) -> ShortFormSuggestion:
    return ShortFormSuggestion(
        finding_id=context.suggestion_type,
        type=context.suggestion_type,
        outcome=SuggestionOutcome.REVIEW_MANUALLY,
        suggested_text=None,
        reason=reason,
        referenced_segment_indices=(),
        placement=resolve_suggestion_placement(context),
        display_label=suggestion_display_label(context.suggestion_type),
    )


def validate_provider_suggestion(
    output: ShortFormSuggestionProviderOutput,
    context: ShortFormSuggestionContext,
) -> ShortFormSuggestionProviderOutput:
    allowed = {segment.index for segment in context.segments}
    if any(index not in allowed for index in output.referenced_segment_indices):
        raise LLMOutputValidationError(
            "The suggestion referenced an unsupplied segment."
        )
    if output.outcome is SuggestionOutcome.SUGGESTED:
        text = output.suggested_text or ""
        if len(text) > MAX_SUGGESTED_TEXT_CHARACTERS:
            raise LLMOutputValidationError("The suggested text exceeds the allowed length.")
        _reject_ungrounded_policy(text, context_source_text(context))
    return output


async def generate_shortform_suggestion(
    finding: PreflightFinding,
    segments: Sequence[SpeechSegment],
    *,
    finding_id: SuggestionType,
    platform: ShortFormPlatform,
    video_duration_seconds: float,
    provider: ShortFormSuggestionGenerator,
) -> ShortFormSuggestion:
    context = build_suggestion_context(
        finding,
        segments,
        finding_id=finding_id,
        platform=platform,
        video_duration_seconds=video_duration_seconds,
    )
    if not has_sufficient_suggestion_context(context):
        return manual_review_suggestion(
            context,
            reason=(
                "There is not enough validated speech to produce a safe suggestion. "
                "Review this finding manually."
            ),
        )

    raw = await provider.generate_suggestion(context)
    output = validate_provider_suggestion(raw, context)
    if output.outcome is SuggestionOutcome.REVIEW_MANUALLY:
        return manual_review_suggestion(context, reason=output.reason)
    return ShortFormSuggestion(
        finding_id=context.suggestion_type,
        type=context.suggestion_type,
        outcome=SuggestionOutcome.SUGGESTED,
        suggested_text=output.suggested_text,
        reason=output.reason,
        referenced_segment_indices=output.referenced_segment_indices,
        placement=resolve_suggestion_placement(context),
        display_label=suggestion_display_label(context.suggestion_type),
    )


def _opening_placement(
    context: ShortFormSuggestionContext,
) -> ShortFormSuggestionPlacement:
    if context.finding_ranges:
        span = context.finding_ranges[0]
        return ShortFormSuggestionPlacement(
            strategy=SuggestionPlacementStrategy.REPLACE_OPENING,
            start_seconds=span.start_seconds,
            end_seconds=span.end_seconds,
        )
    if context.segments:
        first = context.segments[0]
        return ShortFormSuggestionPlacement(
            strategy=SuggestionPlacementStrategy.REPLACE_OPENING,
            start_seconds=first.start_seconds,
            end_seconds=first.end_seconds,
        )
    return ShortFormSuggestionPlacement(
        strategy=SuggestionPlacementStrategy.OPENING_FIRST_SECONDS,
    )


def _cta_placement(context: ShortFormSuggestionContext) -> ShortFormSuggestionPlacement:
    if context.segments:
        last = max(context.segments, key=lambda item: item.end_seconds)
        return ShortFormSuggestionPlacement(
            strategy=SuggestionPlacementStrategy.APPEND_NEAR_END,
            after_seconds=last.end_seconds,
        )
    if context.finding_ranges:
        last_range = max(context.finding_ranges, key=lambda item: item.end_seconds)
        return ShortFormSuggestionPlacement(
            strategy=SuggestionPlacementStrategy.APPEND_NEAR_END,
            after_seconds=last_range.end_seconds,
        )
    return ShortFormSuggestionPlacement(
        strategy=SuggestionPlacementStrategy.APPEND_NEAR_END,
    )


def _reject_ungrounded_policy(suggested_text: str, source_text: str) -> None:
    source = normalize_for_matching(source_text)
    checks = (
        (_URL_PATTERN, "The suggestion introduced an unsupported URL."),
        (_COUPON_PATTERN, "The suggestion introduced an unsupported coupon or code."),
        (_STATISTIC_PATTERN, "The suggestion introduced an unsupported statistic."),
        (_GUARANTEE_PATTERN, "The suggestion introduced an unsupported guarantee."),
        (_CLICKBAIT_PATTERN, "The suggestion introduced unsupported clickbait wording."),
        (
            _UNSUPPORTED_PROMO_PATTERN,
            "The suggestion introduced an unsupported promotion.",
        ),
    )
    for pattern, message in checks:
        for match in pattern.finditer(suggested_text):
            token = normalize_for_matching(match.group(0))
            if token and token not in source:
                raise LLMOutputValidationError(message)
