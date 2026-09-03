from collections.abc import Callable, Sequence
from enum import StrEnum
from types import MappingProxyType
from typing import cast

from app.domain.compliance import ComplianceReport, ComplianceResult
from app.domain.requirements import (
    ForbiddenPhraseRequirement,
    RequiredExactTokenRequirement,
    RequiredMentionBeforeRequirement,
    RequiredMentionRequirement,
    RequiredURLRequirement,
    Requirement,
    RequirementType,
    SponsorshipRequirement,
)
from app.domain.transcript import TranscriptSegment
from app.services.checkers import (
    check_forbidden_phrase,
    check_required_exact_token,
    check_required_mention,
    check_required_mention_before,
    check_required_url,
)
from app.services.scoring import summarize_results


class ComplianceInputErrorCode(StrEnum):
    INVALID_REQUIREMENT_COLLECTION = "invalid_requirement_collection"
    EMPTY_REQUIREMENTS = "empty_requirements"
    INVALID_REQUIREMENT = "invalid_requirement"
    DUPLICATE_REQUIREMENT_ID = "duplicate_requirement_id"
    INVALID_TRANSCRIPT_COLLECTION = "invalid_transcript_collection"
    EMPTY_TRANSCRIPT = "empty_transcript"
    INVALID_TRANSCRIPT_SEGMENT = "invalid_transcript_segment"
    UNSUPPORTED_REQUIREMENT_TYPE = "unsupported_requirement_type"


class ComplianceInputError(ValueError):
    """Controlled error for invalid engine input, never a compliance result."""

    def __init__(self, message: str, *, code: ComplianceInputErrorCode) -> None:
        self.code = code
        super().__init__(message)


Checker = Callable[
    [SponsorshipRequirement, Sequence[TranscriptSegment]],
    ComplianceResult,
]

_CHECKERS: MappingProxyType[RequirementType, Checker] = MappingProxyType(
    {
        RequirementType.REQUIRED_MENTION: cast(Checker, check_required_mention),
        RequirementType.REQUIRED_EXACT_TOKEN: cast(
            Checker,
            check_required_exact_token,
        ),
        RequirementType.FORBIDDEN_PHRASE: cast(Checker, check_forbidden_phrase),
        RequirementType.REQUIRED_MENTION_BEFORE: cast(
            Checker,
            check_required_mention_before,
        ),
        RequirementType.REQUIRED_URL: cast(Checker, check_required_url),
    }
)

_SUPPORTED_REQUIREMENT_MODELS = (
    RequiredMentionRequirement,
    RequiredExactTokenRequirement,
    ForbiddenPhraseRequirement,
    RequiredMentionBeforeRequirement,
    RequiredURLRequirement,
)


def evaluate_compliance(
    requirements: Sequence[Requirement],
    transcript_segments: Sequence[TranscriptSegment],
) -> ComplianceReport:
    """Evaluate validated requirements in their supplied order."""

    validated_requirements = _validate_requirements(requirements)
    validated_segments = _validate_transcript(transcript_segments)

    results: list[ComplianceResult] = []
    for requirement in validated_requirements:
        checker = _CHECKERS.get(requirement.type)
        if checker is None:
            raise ComplianceInputError(
                f"Unsupported requirement type: {requirement.type!s}.",
                code=ComplianceInputErrorCode.UNSUPPORTED_REQUIREMENT_TYPE,
            )
        results.append(checker(requirement, validated_segments))

    summary = summarize_results(results)
    return ComplianceReport(results=tuple(results), summary=summary)


def _validate_requirements(
    requirements: object,
) -> tuple[Requirement, ...]:
    if not isinstance(requirements, Sequence) or isinstance(
        requirements,
        (str, bytes),
    ):
        raise ComplianceInputError(
            "Requirements must be supplied as a sequence of validated models.",
            code=ComplianceInputErrorCode.INVALID_REQUIREMENT_COLLECTION,
        )
    if not requirements:
        raise ComplianceInputError(
            "At least one requirement is required.",
            code=ComplianceInputErrorCode.EMPTY_REQUIREMENTS,
        )

    validated: list[Requirement] = []
    seen_ids: dict[str, int] = {}
    for position, requirement in enumerate(requirements):
        if not isinstance(requirement, _SUPPORTED_REQUIREMENT_MODELS):
            raise ComplianceInputError(
                f"Requirement at position {position} is not a validated model.",
                code=ComplianceInputErrorCode.INVALID_REQUIREMENT,
            )

        previous_position = seen_ids.get(requirement.id)
        if previous_position is not None:
            raise ComplianceInputError(
                f'Duplicate requirement ID "{requirement.id}" at positions '
                f"{previous_position} and {position}.",
                code=ComplianceInputErrorCode.DUPLICATE_REQUIREMENT_ID,
            )
        seen_ids[requirement.id] = position
        validated.append(requirement)
    return tuple(validated)


def _validate_transcript(
    transcript_segments: object,
) -> tuple[TranscriptSegment, ...]:
    if not isinstance(transcript_segments, Sequence) or isinstance(
        transcript_segments,
        (str, bytes),
    ):
        raise ComplianceInputError(
            "Transcript segments must be supplied as a sequence.",
            code=ComplianceInputErrorCode.INVALID_TRANSCRIPT_COLLECTION,
        )
    if not transcript_segments:
        raise ComplianceInputError(
            "At least one transcript segment is required.",
            code=ComplianceInputErrorCode.EMPTY_TRANSCRIPT,
        )

    validated: list[TranscriptSegment] = []
    for position, segment in enumerate(transcript_segments):
        if not isinstance(segment, TranscriptSegment):
            raise ComplianceInputError(
                f"Transcript item at position {position} is not a validated segment.",
                code=ComplianceInputErrorCode.INVALID_TRANSCRIPT_SEGMENT,
            )
        validated.append(segment)
    return tuple(validated)
