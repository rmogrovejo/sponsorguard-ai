import pytest
from pydantic import ValidationError

from app.domain.fixes import (
    FixAction,
    FixPlacement,
    FixPlacementStrategy,
    FixProviderOutput,
    GeneratedFix,
)


def test_generated_fix_is_typed_and_immutable() -> None:
    fix = GeneratedFix(
        requirement_id="req_coupon",
        action=FixAction.INSERT,
        suggested_text="Use code CREATOR25 at checkout.",
        placement=FixPlacement(
            strategy=FixPlacementStrategy.AFTER_SEGMENT,
            segment_index=2,
            timestamp_seconds=52.0,
        ),
        reason="The promo code is missing.",
    )

    assert fix.model_dump(mode="json")["action"] == "insert"
    with pytest.raises(ValidationError):
        fix.reason = "changed"  # type: ignore[misc]


@pytest.mark.parametrize(
    "payload",
    [
        {
            "action": "insert",
            "suggested_text": None,
            "referenced_segment_indices": [2],
            "reason": "Missing text.",
        },
        {
            "action": "replace",
            "suggested_text": "Replacement.",
            "referenced_segment_indices": [],
            "reason": "Missing grounding.",
        },
        {
            "action": "insert",
            "suggested_text": "Suggestion.",
            "referenced_segment_indices": [2, 2],
            "reason": "Duplicate grounding.",
        },
        {
            "action": "invent",
            "suggested_text": "Suggestion.",
            "referenced_segment_indices": [2],
            "reason": "Bad action.",
        },
    ],
)
def test_provider_fix_output_rejects_invalid_structures(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        FixProviderOutput.model_validate(payload)


def test_before_deadline_placement_requires_deadline_and_grounded_bundle() -> None:
    with pytest.raises(ValidationError):
        FixPlacement(
            strategy=FixPlacementStrategy.BEFORE_DEADLINE,
            segment_index=1,
            timestamp_seconds=3.0,
        )
    with pytest.raises(ValidationError):
        FixPlacement(
            strategy=FixPlacementStrategy.AFTER_SEGMENT,
            segment_index=1,
        )
