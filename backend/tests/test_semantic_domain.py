import pytest
from pydantic import ValidationError

from app.domain.requirements import (
    ForbiddenClaimRequirement,
    RequiredTalkingPointRequirement,
    RequirementType,
    validate_requirement,
)
from app.domain.semantic import SemanticDecision, SemanticVerificationOutput


def test_required_talking_point_is_typed_and_normalized() -> None:
    requirement = RequiredTalkingPointRequirement(
        id="req_editing_time",
        description="  Explain the editing benefit  ",
        value="Reduce\u00a0editing   time",
    )

    assert requirement.type is RequirementType.REQUIRED_TALKING_POINT
    assert requirement.description == "Explain the editing benefit"
    assert requirement.value == "Reduce editing time"


def test_forbidden_claim_is_typed_and_immutable() -> None:
    requirement = ForbiddenClaimRequirement(
        id="req_untraceable",
        description="Avoid an absolute privacy claim",
        value="The VPN makes users completely untraceable",
    )

    assert requirement.type is RequirementType.FORBIDDEN_CLAIM
    with pytest.raises(ValidationError):
        requirement.value = "changed"  # type: ignore[misc]


@pytest.mark.parametrize("requirement_type", ["required_talking_point", "forbidden_claim"])
def test_semantic_requirement_rejects_blank_target(requirement_type: str) -> None:
    with pytest.raises(ValidationError):
        validate_requirement(
            {
                "id": "req_semantic",
                "type": requirement_type,
                "description": "Review meaning",
                "value": " \u2003 ",
            }
        )


def test_semantic_requirement_rejects_unexpected_fields() -> None:
    with pytest.raises(ValidationError):
        validate_requirement(
            {
                "id": "req_semantic",
                "type": "required_talking_point",
                "description": "Review meaning",
                "value": "Reduce editing time",
                "before_seconds": 60,
            }
        )


@pytest.mark.parametrize(
    ("decision", "indices"),
    [
        (SemanticDecision.MATCH, (7,)),
        (SemanticDecision.NO_MATCH, ()),
        (SemanticDecision.UNCERTAIN, (7, 9)),
    ],
)
def test_semantic_output_accepts_only_explicit_decisions(
    decision: SemanticDecision,
    indices: tuple[int, ...],
) -> None:
    output = SemanticVerificationOutput(
        decision=decision,
        segment_indices=indices,
        reason="Grounded decision.",
    )

    assert output.decision is decision
    assert output.segment_indices == indices


@pytest.mark.parametrize(
    "payload",
    [
        {"decision": "pass", "segment_indices": [1], "reason": "Invalid."},
        {"decision": "match", "segment_indices": [], "reason": "No evidence."},
        {"decision": "no_match", "segment_indices": [1], "reason": "Evidence."},
        {"decision": "match", "segment_indices": [True], "reason": "Bad index."},
        {"decision": "match", "segment_indices": [1, 1], "reason": "Duplicate."},
        {
            "decision": "match",
            "segment_indices": [1],
            "reason": "Valid.",
            "evidence": "Invented quote",
        },
    ],
)
def test_semantic_output_rejects_malformed_shapes(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        SemanticVerificationOutput.model_validate(payload)
