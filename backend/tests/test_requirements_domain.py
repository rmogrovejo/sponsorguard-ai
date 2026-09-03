import math

import pytest
from pydantic import ValidationError

from app.domain.requirements import (
    ForbiddenPhraseRequirement,
    RequiredExactTokenRequirement,
    RequiredMentionBeforeRequirement,
    RequiredMentionRequirement,
    RequiredURLRequirement,
    RequirementType,
    validate_requirement,
)


def test_validates_each_supported_requirement_type() -> None:
    requirements = [
        RequiredMentionRequirement(
            id="req_brand",
            description="Mention AcmeVPN",
            value="AcmeVPN",
        ),
        RequiredExactTokenRequirement(
            id="req_coupon",
            description="Say the creator code",
            value="CREATOR25",
        ),
        ForbiddenPhraseRequirement(
            id="req_forbidden",
            description="Avoid unsupported privacy claim",
            value="guaranteed anonymity",
        ),
        RequiredMentionBeforeRequirement(
            id="req_brand_timing",
            description="Mention AcmeVPN before 01:00",
            value="AcmeVPN",
            before_seconds=60,
        ),
        RequiredURLRequirement(
            id="req_campaign_url",
            description="Mention campaign URL",
            value="https://www.acmevpn.com/creator/",
        ),
    ]

    assert [item.model_dump(mode="json") for item in requirements] == [
        {
            "id": "req_brand",
            "type": "required_mention",
            "description": "Mention AcmeVPN",
            "value": "AcmeVPN",
        },
        {
            "id": "req_coupon",
            "type": "required_exact_token",
            "description": "Say the creator code",
            "value": "CREATOR25",
        },
        {
            "id": "req_forbidden",
            "type": "forbidden_phrase",
            "description": "Avoid unsupported privacy claim",
            "value": "guaranteed anonymity",
        },
        {
            "id": "req_brand_timing",
            "type": "required_mention_before",
            "description": "Mention AcmeVPN before 01:00",
            "value": "AcmeVPN",
            "before_seconds": 60.0,
        },
        {
            "id": "req_campaign_url",
            "type": "required_url",
            "description": "Mention campaign URL",
            "value": "acmevpn.com/creator",
        },
    ]


def test_validates_untrusted_requirement_mapping() -> None:
    requirement = validate_requirement(
        {
            "id": "req_brand",
            "type": "required_mention",
            "description": "Mention AcmeVPN",
            "value": "AcmeVPN",
        }
    )

    assert isinstance(requirement, RequiredMentionRequirement)
    assert requirement.type is RequirementType.REQUIRED_MENTION


def test_normalizes_requirement_whitespace() -> None:
    requirement = RequiredMentionRequirement(
        id="  req_brand  ",
        description="  Mention\n  AcmeVPN  ",
        value="  AcmeVPN\t ",
    )

    assert requirement.id == "req_brand"
    assert requirement.description == "Mention AcmeVPN"
    assert requirement.value == "AcmeVPN"


@pytest.mark.parametrize("field", ["id", "description", "value"])
@pytest.mark.parametrize("blank", ["", " \n\t "])
def test_rejects_blank_required_text(field: str, blank: str) -> None:
    values = {
        "id": "req_brand",
        "description": "Mention AcmeVPN",
        "value": "AcmeVPN",
    }
    values[field] = blank

    with pytest.raises(ValidationError):
        RequiredMentionRequirement.model_validate(values)


@pytest.mark.parametrize("requirement_id", ["has spaces", "1starts_with_number", "bad!"])
def test_rejects_unstable_requirement_ids(requirement_id: str) -> None:
    with pytest.raises(ValidationError):
        RequiredMentionRequirement(
            id=requirement_id,
            description="Mention AcmeVPN",
            value="AcmeVPN",
        )


@pytest.mark.parametrize("value", [-1, math.nan, math.inf, "60", True])
def test_rejects_invalid_timing_values(value: object) -> None:
    with pytest.raises(ValidationError):
        RequiredMentionBeforeRequirement(
            id="req_timing",
            description="Mention AcmeVPN before deadline",
            value="AcmeVPN",
            before_seconds=value,  # type: ignore[arg-type]
        )


def test_rejects_unsupported_requirement_type() -> None:
    with pytest.raises(ValidationError):
        validate_requirement(
            {
                "id": "req_semantic",
                "type": "semantic_claim",
                "description": "Unsupported future rule",
                "value": "private",
            }
        )


def test_rejects_unexpected_requirement_fields() -> None:
    with pytest.raises(ValidationError):
        RequiredMentionRequirement.model_validate(
            {
                "id": "req_brand",
                "description": "Mention AcmeVPN",
                "value": "AcmeVPN",
                "unexpected": True,
            }
        )


def test_requirement_models_are_immutable() -> None:
    requirement = RequiredMentionRequirement(
        id="req_brand",
        description="Mention AcmeVPN",
        value="AcmeVPN",
    )

    with pytest.raises(ValidationError):
        requirement.value = "OtherVPN"
