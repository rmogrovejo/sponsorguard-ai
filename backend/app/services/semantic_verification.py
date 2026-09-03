import json
from collections.abc import Sequence

from pydantic import ValidationError

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceResult,
    ComplianceStatus,
)
from app.domain.requirements import (
    ForbiddenClaimRequirement,
    RequiredTalkingPointRequirement,
)
from app.domain.semantic import (
    SemanticDecision,
    SemanticRequirement,
    SemanticVerificationOutput,
)
from app.domain.transcript import TranscriptSegment
from app.integrations.llm.base import SemanticVerifier
from app.integrations.llm.exceptions import LLMOutputValidationError, LLMProviderError


MAX_SEMANTIC_CHUNK_SERIALIZED_TEXT_CHARACTERS = 3_500
MAX_SEMANTIC_SEGMENTS_PER_CHUNK = 30


class SemanticVerificationService:
    """Verify semantic rules while keeping evidence grounded in source segments."""

    def __init__(self, provider: SemanticVerifier) -> None:
        self._provider = provider

    async def verify(
        self,
        requirement: SemanticRequirement,
        transcript_segments: Sequence[TranscriptSegment],
    ) -> ComplianceResult:
        original_segments = tuple(transcript_segments)
        if _has_duplicate_source_indices(original_segments):
            return _unavailable_result(
                requirement,
                reason=(
                    "Semantic verification could not safely ground evidence because "
                    "the transcript contains duplicate cue indices."
                ),
            )

        uncertain_indices: set[int] = set()
        saw_uncertain = False
        try:
            for chunk in create_semantic_chunks(original_segments):
                raw_output = await self._provider.verify_semantics(requirement, chunk)
                output = _validate_provider_output(raw_output, chunk)
                if output.decision is SemanticDecision.MATCH:
                    return _result_for_decision(
                        requirement,
                        output.decision,
                        output.segment_indices,
                        original_segments,
                    )
                if output.decision is SemanticDecision.UNCERTAIN:
                    saw_uncertain = True
                    uncertain_indices.update(output.segment_indices)
        except LLMProviderError:
            return _unavailable_result(requirement)

        final_decision = (
            SemanticDecision.UNCERTAIN
            if saw_uncertain
            else SemanticDecision.NO_MATCH
        )
        return _result_for_decision(
            requirement,
            final_decision,
            tuple(uncertain_indices),
            original_segments,
        )


def create_semantic_chunks(
    transcript_segments: Sequence[TranscriptSegment],
) -> tuple[tuple[TranscriptSegment, ...], ...]:
    """Create deterministic, non-overlapping chunks with bounded serialized text."""

    chunks: list[tuple[TranscriptSegment, ...]] = []
    current: list[TranscriptSegment] = []
    current_cost = 0

    for original in transcript_segments:
        fragments = _split_segment(original)
        for fragment in fragments:
            fragment_cost = _serialized_text_cost(fragment.text)
            duplicate_source = any(item.index == fragment.index for item in current)
            exceeds_count = len(current) >= MAX_SEMANTIC_SEGMENTS_PER_CHUNK
            exceeds_text = current_cost + fragment_cost > (
                MAX_SEMANTIC_CHUNK_SERIALIZED_TEXT_CHARACTERS
            )
            if current and (duplicate_source or exceeds_count or exceeds_text):
                chunks.append(tuple(current))
                current = []
                current_cost = 0

            current.append(fragment)
            current_cost += fragment_cost

    if current:
        chunks.append(tuple(current))
    return tuple(chunks)


def _split_segment(segment: TranscriptSegment) -> tuple[TranscriptSegment, ...]:
    if _serialized_text_cost(segment.text) <= (
        MAX_SEMANTIC_CHUNK_SERIALIZED_TEXT_CHARACTERS
    ):
        return (segment,)

    fragments: list[TranscriptSegment] = []
    remaining = segment.text
    while remaining:
        split_at = _largest_prefix_within_budget(remaining)
        if split_at < len(remaining):
            whitespace_at = remaining.rfind(" ", 0, split_at + 1)
            if whitespace_at >= split_at // 2:
                split_at = whitespace_at
        fragment_text = remaining[:split_at].strip()
        remaining = remaining[split_at:].strip()
        if not fragment_text:
            continue
        fragments.append(
            TranscriptSegment(
                index=segment.index,
                start_seconds=segment.start_seconds,
                end_seconds=segment.end_seconds,
                text=fragment_text,
            )
        )
    return tuple(fragments)


def _largest_prefix_within_budget(text: str) -> int:
    low, high = 1, len(text)
    while low < high:
        midpoint = (low + high + 1) // 2
        if _serialized_text_cost(text[:midpoint]) <= (
            MAX_SEMANTIC_CHUNK_SERIALIZED_TEXT_CHARACTERS
        ):
            low = midpoint
        else:
            high = midpoint - 1
    return low


def _serialized_text_cost(value: str) -> int:
    return len(json.dumps(value, ensure_ascii=False))


def _validate_provider_output(
    value: object,
    supplied_segments: Sequence[TranscriptSegment],
) -> SemanticVerificationOutput:
    try:
        if isinstance(value, SemanticVerificationOutput):
            output = SemanticVerificationOutput.model_validate(
                value.model_dump(mode="python")
            )
        else:
            output = SemanticVerificationOutput.model_validate(value)
    except (AttributeError, ValidationError) as error:
        raise LLMOutputValidationError(
            "The semantic verification provider returned invalid structured output."
        ) from error

    allowed = {segment.index for segment in supplied_segments}
    if any(index not in allowed for index in output.segment_indices):
        raise LLMOutputValidationError(
            "The semantic verification provider referenced an unsupplied segment."
        )
    return output


def _result_for_decision(
    requirement: SemanticRequirement,
    decision: SemanticDecision,
    evidence_indices: Sequence[int],
    original_segments: Sequence[TranscriptSegment],
) -> ComplianceResult:
    if isinstance(requirement, RequiredTalkingPointRequirement):
        policy = {
            SemanticDecision.MATCH: (
                ComplianceStatus.PASS,
                ComplianceReasonCode.SEMANTIC_REQUIREMENT_CONFIRMED,
                "Semantic verification confirmed the required talking point.",
            ),
            SemanticDecision.NO_MATCH: (
                ComplianceStatus.FAIL,
                ComplianceReasonCode.SEMANTIC_REQUIREMENT_MISSING,
                "The required talking point was not found in the transcript.",
            ),
            SemanticDecision.UNCERTAIN: (
                ComplianceStatus.WARNING,
                ComplianceReasonCode.SEMANTIC_REQUIREMENT_UNCERTAIN,
                "The required talking point could not be confirmed with enough certainty.",
            ),
        }
    else:
        assert isinstance(requirement, ForbiddenClaimRequirement)
        policy = {
            SemanticDecision.MATCH: (
                ComplianceStatus.FAIL,
                ComplianceReasonCode.FORBIDDEN_CLAIM_DETECTED,
                "Semantic verification detected the prohibited claim.",
            ),
            SemanticDecision.NO_MATCH: (
                ComplianceStatus.PASS,
                ComplianceReasonCode.FORBIDDEN_CLAIM_CLEAR,
                "The prohibited claim was not found in the transcript.",
            ),
            SemanticDecision.UNCERTAIN: (
                ComplianceStatus.WARNING,
                ComplianceReasonCode.FORBIDDEN_CLAIM_UNCERTAIN,
                "The transcript may communicate the prohibited claim and needs review.",
            ),
        }

    status, reason_code, reason = policy[decision]
    evidence_segment = _first_grounded_segment(evidence_indices, original_segments)
    return ComplianceResult(
        requirement_id=requirement.id,
        status=status,
        reason_code=reason_code,
        reason=reason,
        segment_index=evidence_segment.index if evidence_segment else None,
        timestamp_seconds=(
            evidence_segment.start_seconds if evidence_segment else None
        ),
        evidence=evidence_segment.text if evidence_segment else None,
    )


def _first_grounded_segment(
    evidence_indices: Sequence[int],
    original_segments: Sequence[TranscriptSegment],
) -> TranscriptSegment | None:
    referenced = set(evidence_indices)
    return next(
        (segment for segment in original_segments if segment.index in referenced),
        None,
    )


def _has_duplicate_source_indices(
    transcript_segments: Sequence[TranscriptSegment],
) -> bool:
    indices = [segment.index for segment in transcript_segments]
    return len(set(indices)) != len(indices)


def _unavailable_result(
    requirement: SemanticRequirement,
    *,
    reason: str = "Semantic verification temporarily unavailable. Retry this verification before publishing.",
) -> ComplianceResult:
    return ComplianceResult(
        requirement_id=requirement.id,
        status=ComplianceStatus.NOT_EVALUATED,
        reason_code=ComplianceReasonCode.SEMANTIC_VERIFICATION_UNAVAILABLE,
        reason=reason,
    )
