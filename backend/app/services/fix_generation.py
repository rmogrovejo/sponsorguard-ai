import re
from collections.abc import Sequence
from enum import StrEnum

from pydantic import ValidationError

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceResult,
    ComplianceStatus,
)
from app.domain.fixes import (
    FixAction,
    FixPlacement,
    FixPlacementStrategy,
    FixProviderOutput,
    GeneratedFix,
)
from app.domain.requirements import (
    ForbiddenClaimRequirement,
    ForbiddenPhraseRequirement,
    RequiredExactTokenRequirement,
    RequiredMentionBeforeRequirement,
    RequiredMentionRequirement,
    RequiredTalkingPointRequirement,
    RequiredURLRequirement,
    Requirement,
)
from app.domain.semantic import is_semantic_requirement
from app.domain.transcript import TranscriptSegment
from app.domain.urls import extract_normalized_urls
from app.integrations.llm.base import FixGenerator
from app.integrations.llm.exceptions import LLMOutputValidationError
from app.services.compliance_engine import (
    evaluate_deterministic_requirement,
    validate_transcript,
)
from app.services.matchers import contains_bounded_match


MAX_FIX_CONTEXT_SEGMENTS = 3
MAX_FIX_CONTEXT_SEGMENT_CHARACTERS = 1_500


class FixGenerationInputErrorCode(StrEnum):
    REQUIREMENT_ID_MISMATCH = "requirement_id_mismatch"
    INELIGIBLE_FINDING = "ineligible_finding"
    FINDING_MISMATCH = "finding_mismatch"
    AMBIGUOUS_TRANSCRIPT_INDICES = "ambiguous_transcript_indices"


class FixGenerationInputError(ValueError):
    def __init__(self, message: str, *, code: FixGenerationInputErrorCode) -> None:
        self.code = code
        super().__init__(message)


async def generate_fix(
    requirement: Requirement,
    finding: ComplianceResult,
    transcript_segments: Sequence[TranscriptSegment],
    provider: FixGenerator,
) -> GeneratedFix:
    """Generate one advisory fix after independently validating the finding."""

    segments = validate_transcript(transcript_segments)
    _validate_eligibility(requirement, finding, segments)

    deterministic = _deterministic_fix(requirement, finding, segments)
    if deterministic is not None:
        _post_validate_fix(requirement, deterministic, segments)
        return deterministic

    context = create_fix_context(finding, segments)
    raw_output = await provider.generate_fix(requirement, context)
    output = _validate_provider_output(raw_output, context)
    generated = _ground_provider_output(requirement, output, context)
    _post_validate_fix(requirement, generated, context)
    return generated


def create_fix_context(
    finding: ComplianceResult,
    transcript_segments: Sequence[TranscriptSegment],
) -> tuple[TranscriptSegment, ...]:
    """Return at most three deterministic, non-overlapping source excerpts."""

    segments = tuple(transcript_segments)
    if len({segment.index for segment in segments}) != len(segments):
        raise FixGenerationInputError(
            "Fix context cannot safely ground duplicate source cue indices.",
            code=FixGenerationInputErrorCode.AMBIGUOUS_TRANSCRIPT_INDICES,
        )

    center = _finding_position(finding, segments)
    if center is None:
        center = _placement_anchor_position(segments)
    start = max(0, center - 1)
    end = min(len(segments), start + MAX_FIX_CONTEXT_SEGMENTS)
    return tuple(_bounded_excerpt(segment) for segment in segments[start:end])


def _validate_eligibility(
    requirement: Requirement,
    finding: ComplianceResult,
    segments: Sequence[TranscriptSegment],
) -> None:
    if requirement.id != finding.requirement_id:
        raise FixGenerationInputError(
            "The finding does not belong to the supplied requirement.",
            code=FixGenerationInputErrorCode.REQUIREMENT_ID_MISMATCH,
        )
    if finding.status not in {ComplianceStatus.FAIL, ComplianceStatus.WARNING}:
        raise FixGenerationInputError(
            "Only failed or uncertain findings are eligible for a generated fix.",
            code=FixGenerationInputErrorCode.INELIGIBLE_FINDING,
        )

    if not is_semantic_requirement(requirement):
        expected = evaluate_deterministic_requirement(requirement, segments)
        if expected != finding:
            raise FixGenerationInputError(
                "The finding does not match deterministic transcript evaluation.",
                code=FixGenerationInputErrorCode.FINDING_MISMATCH,
            )
        return

    allowed = _semantic_reason_policy(requirement)
    if allowed.get(finding.reason_code) is not finding.status:
        raise FixGenerationInputError(
            "The semantic finding status and reason are inconsistent.",
            code=FixGenerationInputErrorCode.FINDING_MISMATCH,
        )
    _validate_grounded_finding(finding, segments)


def _semantic_reason_policy(
    requirement: Requirement,
) -> dict[ComplianceReasonCode, ComplianceStatus]:
    if isinstance(requirement, RequiredTalkingPointRequirement):
        return {
            ComplianceReasonCode.SEMANTIC_REQUIREMENT_MISSING: ComplianceStatus.FAIL,
            ComplianceReasonCode.SEMANTIC_REQUIREMENT_UNCERTAIN: ComplianceStatus.WARNING,
        }
    assert isinstance(requirement, ForbiddenClaimRequirement)
    return {
        ComplianceReasonCode.FORBIDDEN_CLAIM_DETECTED: ComplianceStatus.FAIL,
        ComplianceReasonCode.FORBIDDEN_CLAIM_UNCERTAIN: ComplianceStatus.WARNING,
    }


def _validate_grounded_finding(
    finding: ComplianceResult,
    segments: Sequence[TranscriptSegment],
) -> None:
    if finding.segment_index is None:
        return
    match = next(
        (
            segment
            for segment in segments
            if segment.index == finding.segment_index
            and segment.start_seconds == finding.timestamp_seconds
            and segment.text == finding.evidence
        ),
        None,
    )
    if match is None:
        raise FixGenerationInputError(
            "The finding evidence is not grounded in the supplied transcript.",
            code=FixGenerationInputErrorCode.FINDING_MISMATCH,
        )


def _deterministic_fix(
    requirement: Requirement,
    finding: ComplianceResult,
    segments: Sequence[TranscriptSegment],
) -> GeneratedFix | None:
    if isinstance(requirement, RequiredExactTokenRequirement):
        return _insertion_fix(
            requirement,
            f"Use code {requirement.value} at checkout.",
            "Insert the missing required promo code.",
            segments,
        )
    if isinstance(requirement, RequiredURLRequirement):
        return _insertion_fix(
            requirement,
            f"Visit {requirement.value} to learn more.",
            "Insert the missing campaign URL using its authoritative value.",
            segments,
        )
    if isinstance(requirement, RequiredMentionBeforeRequirement):
        anchor = _segment_for_finding(finding, segments) or segments[0]
        reason = (
            "Move or repeat the existing sponsor mention before the deadline."
            if finding.reason_code is ComplianceReasonCode.REQUIRED_MENTION_TOO_LATE
            else "Insert the missing sponsor mention before the deadline."
        )
        return GeneratedFix(
            requirement_id=requirement.id,
            action=FixAction.INSERT,
            suggested_text=f"This content is sponsored by {requirement.value}.",
            placement=FixPlacement(
                strategy=FixPlacementStrategy.BEFORE_DEADLINE,
                segment_index=anchor.index,
                timestamp_seconds=anchor.start_seconds,
                before_seconds=requirement.before_seconds,
            ),
            reason=reason,
        )
    if isinstance(requirement, RequiredMentionRequirement):
        return _insertion_fix(
            requirement,
            f"This content is sponsored by {requirement.value}.",
            "Insert the missing required sponsor mention.",
            segments,
        )
    if isinstance(requirement, ForbiddenPhraseRequirement):
        return None
    if isinstance(requirement, (RequiredTalkingPointRequirement, ForbiddenClaimRequirement)):
        return None
    return None


def _insertion_fix(
    requirement: Requirement,
    suggested_text: str,
    reason: str,
    segments: Sequence[TranscriptSegment],
) -> GeneratedFix:
    anchor = segments[_placement_anchor_position(segments)]
    return GeneratedFix(
        requirement_id=requirement.id,
        action=FixAction.INSERT,
        suggested_text=suggested_text,
        placement=FixPlacement(
            strategy=FixPlacementStrategy.AFTER_SEGMENT,
            segment_index=anchor.index,
            timestamp_seconds=anchor.start_seconds,
        ),
        reason=reason,
    )


def _validate_provider_output(
    value: object,
    context: Sequence[TranscriptSegment],
) -> FixProviderOutput:
    try:
        if isinstance(value, FixProviderOutput):
            output = FixProviderOutput.model_validate(value.model_dump(mode="python"))
        else:
            output = FixProviderOutput.model_validate(value)
    except (AttributeError, ValidationError) as error:
        raise LLMOutputValidationError(
            "The fix provider returned invalid structured output."
        ) from error
    allowed = {segment.index for segment in context}
    if any(index not in allowed for index in output.referenced_segment_indices):
        raise LLMOutputValidationError(
            "The fix provider referenced an unsupplied segment."
        )
    return output


def _ground_provider_output(
    requirement: Requirement,
    output: FixProviderOutput,
    context: Sequence[TranscriptSegment],
) -> GeneratedFix:
    referenced = set(output.referenced_segment_indices)
    anchor = next((segment for segment in context if segment.index in referenced), None)
    placement = None
    if anchor is not None:
        if output.action is FixAction.REPLACE:
            strategy = FixPlacementStrategy.REPLACE_SEGMENT
        elif output.action is FixAction.INSERT:
            strategy = FixPlacementStrategy.AFTER_SEGMENT
        else:
            strategy = FixPlacementStrategy.REVIEW_SEGMENT
        placement = FixPlacement(
            strategy=strategy,
            segment_index=anchor.index,
            timestamp_seconds=anchor.start_seconds,
        )
    return GeneratedFix(
        requirement_id=requirement.id,
        action=output.action,
        suggested_text=output.suggested_text,
        placement=placement,
        reason=output.reason,
    )


def _post_validate_fix(
    requirement: Requirement,
    generated: GeneratedFix,
    context: Sequence[TranscriptSegment],
) -> None:
    suggestion = generated.suggested_text
    if generated.action in {FixAction.INSERT, FixAction.REPLACE} and suggestion is None:
        raise LLMOutputValidationError("The generated fix contains no usable text.")
    if suggestion is None:
        return

    if isinstance(requirement, RequiredExactTokenRequirement) and not re.search(
        rf"(?<!\w){re.escape(requirement.value)}(?!\w)", suggestion
    ):
        raise LLMOutputValidationError(
            "The generated fix did not preserve the required exact token."
        )
    if isinstance(requirement, RequiredURLRequirement) and (
        requirement.value not in suggestion
    ):
        raise LLMOutputValidationError(
            "The generated fix did not preserve the authoritative campaign URL."
        )
    if isinstance(requirement, RequiredMentionRequirement) and not contains_bounded_match(
        suggestion, requirement.value
    ):
        raise LLMOutputValidationError(
            "The generated fix did not preserve the required mention."
        )
    if isinstance(requirement, ForbiddenPhraseRequirement) and contains_bounded_match(
        suggestion, requirement.value
    ):
        raise LLMOutputValidationError(
            "The replacement retained the forbidden literal phrase."
        )

    if isinstance(requirement, (ForbiddenPhraseRequirement, ForbiddenClaimRequirement)):
        _reject_detectable_unsupported_additions(requirement, suggestion, context)


def _reject_detectable_unsupported_additions(
    requirement: Requirement,
    suggestion: str,
    context: Sequence[TranscriptSegment],
) -> None:
    unsafe_promises = re.compile(
        r"\b(?:guarantees?|certified|clinically proven|legally compliant|ftc compliant)\b",
        re.IGNORECASE,
    )
    if unsafe_promises.search(suggestion):
        raise LLMOutputValidationError(
            "The generated fix introduced a prohibited unsupported promise."
        )
    source = " ".join([requirement.value, *(segment.text for segment in context)])
    source_numbers = set(re.findall(r"\d+(?:\.\d+)?%?", source))
    suggestion_numbers = set(re.findall(r"\d+(?:\.\d+)?%?", suggestion))
    if not suggestion_numbers.issubset(source_numbers):
        raise LLMOutputValidationError(
            "The generated fix introduced an unsupported numeric claim."
        )
    source_urls = set(extract_normalized_urls(source))
    suggestion_urls = set(extract_normalized_urls(suggestion))
    if not suggestion_urls.issubset(source_urls):
        raise LLMOutputValidationError(
            "The generated fix introduced an unsupported URL."
        )


def _finding_position(
    finding: ComplianceResult,
    segments: Sequence[TranscriptSegment],
) -> int | None:
    if finding.segment_index is None:
        return None
    for position, segment in enumerate(segments):
        if segment.index == finding.segment_index:
            return position
    return None


def _segment_for_finding(
    finding: ComplianceResult,
    segments: Sequence[TranscriptSegment],
) -> TranscriptSegment | None:
    position = _finding_position(finding, segments)
    return segments[position] if position is not None else None


def _placement_anchor_position(segments: Sequence[TranscriptSegment]) -> int:
    prioritized_terms = ("checkout", "code", "discount", "offer", "link", "sponsor")
    for term in prioritized_terms:
        for position, segment in enumerate(segments):
            if contains_bounded_match(segment.text, term):
                return position
    return 0


def _bounded_excerpt(segment: TranscriptSegment) -> TranscriptSegment:
    if len(segment.text) <= MAX_FIX_CONTEXT_SEGMENT_CHARACTERS:
        return segment
    return segment.model_copy(
        update={"text": segment.text[:MAX_FIX_CONTEXT_SEGMENT_CHARACTERS].rstrip()}
    )
