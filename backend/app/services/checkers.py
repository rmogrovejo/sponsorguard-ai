from collections.abc import Sequence

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceResult,
    ComplianceStatus,
)
from app.domain.requirements import (
    ForbiddenPhraseRequirement,
    RequiredExactTokenRequirement,
    RequiredMentionBeforeRequirement,
    RequiredMentionRequirement,
    RequiredURLRequirement,
    SponsorshipRequirement,
)
from app.domain.transcript import TranscriptSegment
from app.services.matchers import find_earliest_match, find_earliest_url_match


def check_required_mention(
    requirement: RequiredMentionRequirement,
    transcript_segments: Sequence[TranscriptSegment],
) -> ComplianceResult:
    match = find_earliest_match(transcript_segments, requirement.value)
    if match is None:
        return _result_without_evidence(
            requirement,
            status=ComplianceStatus.FAIL,
            reason_code=ComplianceReasonCode.REQUIRED_MENTION_MISSING,
            reason=f'Required mention "{requirement.value}" was not found.',
        )

    return _result_with_evidence(
        requirement,
        status=ComplianceStatus.PASS,
        reason_code=ComplianceReasonCode.REQUIRED_MENTION_FOUND,
        reason=f'Required mention "{requirement.value}" was found.',
        segment=match,
    )


def check_required_exact_token(
    requirement: RequiredExactTokenRequirement,
    transcript_segments: Sequence[TranscriptSegment],
) -> ComplianceResult:
    match = find_earliest_match(transcript_segments, requirement.value)
    if match is None:
        return _result_without_evidence(
            requirement,
            status=ComplianceStatus.FAIL,
            reason_code=ComplianceReasonCode.REQUIRED_TOKEN_MISSING,
            reason=f'Required token "{requirement.value}" was not found.',
        )

    return _result_with_evidence(
        requirement,
        status=ComplianceStatus.PASS,
        reason_code=ComplianceReasonCode.REQUIRED_TOKEN_FOUND,
        reason=f'Required token "{requirement.value}" was found.',
        segment=match,
    )


def check_required_mention_before(
    requirement: RequiredMentionBeforeRequirement,
    transcript_segments: Sequence[TranscriptSegment],
) -> ComplianceResult:
    match = find_earliest_match(transcript_segments, requirement.value)
    if match is None:
        return _result_without_evidence(
            requirement,
            status=ComplianceStatus.FAIL,
            reason_code=ComplianceReasonCode.REQUIRED_MENTION_MISSING,
            reason=f'Required mention "{requirement.value}" was not found.',
        )

    match_time = _format_timestamp(match.start_seconds)
    deadline = _format_timestamp(requirement.before_seconds)
    if match.start_seconds <= requirement.before_seconds:
        return _result_with_evidence(
            requirement,
            status=ComplianceStatus.PASS,
            reason_code=ComplianceReasonCode.REQUIRED_MENTION_WITHIN_DEADLINE,
            reason=(
                f'Required mention "{requirement.value}" was found at {match_time}, '
                f"within the {deadline} deadline."
            ),
            segment=match,
        )

    seconds_late = match.start_seconds - requirement.before_seconds
    return _result_with_evidence(
        requirement,
        status=ComplianceStatus.FAIL,
        reason_code=ComplianceReasonCode.REQUIRED_MENTION_TOO_LATE,
        reason=(
            f'Required mention "{requirement.value}" was found at {match_time}, '
            f"{_format_duration(seconds_late)} after the allowed deadline."
        ),
        segment=match,
    )


def check_forbidden_phrase(
    requirement: ForbiddenPhraseRequirement,
    transcript_segments: Sequence[TranscriptSegment],
) -> ComplianceResult:
    match = find_earliest_match(transcript_segments, requirement.value)
    if match is None:
        return _result_without_evidence(
            requirement,
            status=ComplianceStatus.PASS,
            reason_code=ComplianceReasonCode.FORBIDDEN_PHRASE_ABSENT,
            reason=f'Forbidden phrase "{requirement.value}" was not found.',
        )

    return _result_with_evidence(
        requirement,
        status=ComplianceStatus.FAIL,
        reason_code=ComplianceReasonCode.FORBIDDEN_PHRASE_FOUND,
        reason=f'Forbidden phrase "{requirement.value}" was found.',
        segment=match,
    )


def check_required_url(
    requirement: RequiredURLRequirement,
    transcript_segments: Sequence[TranscriptSegment],
) -> ComplianceResult:
    match = find_earliest_url_match(transcript_segments, requirement.value)
    if match is None:
        return _result_without_evidence(
            requirement,
            status=ComplianceStatus.FAIL,
            reason_code=ComplianceReasonCode.REQUIRED_URL_MISSING,
            reason=f'Required URL "{requirement.value}" was not found.',
        )

    return _result_with_evidence(
        requirement,
        status=ComplianceStatus.PASS,
        reason_code=ComplianceReasonCode.REQUIRED_URL_FOUND,
        reason=f'Required URL "{requirement.value}" was found.',
        segment=match,
    )


def _result_with_evidence(
    requirement: SponsorshipRequirement,
    *,
    status: ComplianceStatus,
    reason_code: ComplianceReasonCode,
    reason: str,
    segment: TranscriptSegment,
) -> ComplianceResult:
    return ComplianceResult(
        requirement_id=requirement.id,
        status=status,
        reason_code=reason_code,
        reason=reason,
        segment_index=segment.index,
        timestamp_seconds=segment.start_seconds,
        evidence=segment.text,
    )


def _result_without_evidence(
    requirement: SponsorshipRequirement,
    *,
    status: ComplianceStatus,
    reason_code: ComplianceReasonCode,
    reason: str,
) -> ComplianceResult:
    return ComplianceResult(
        requirement_id=requirement.id,
        status=status,
        reason_code=reason_code,
        reason=reason,
    )


def _format_timestamp(seconds: float) -> str:
    total_milliseconds = round(seconds * 1_000)
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1_000)

    if hours:
        timestamp = f"{hours:02}:{minutes:02}:{whole_seconds:02}"
    else:
        timestamp = f"{minutes:02}:{whole_seconds:02}"
    if milliseconds:
        timestamp += f".{milliseconds:03}"
    return timestamp


def _format_duration(seconds: float) -> str:
    value = f"{seconds:.3f}".rstrip("0").rstrip(".")
    unit = "second" if value == "1" else "seconds"
    return f"{value} {unit}"
