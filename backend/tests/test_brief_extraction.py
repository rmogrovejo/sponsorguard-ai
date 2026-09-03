import asyncio
from collections.abc import Iterator

import pytest
from pydantic import ValidationError

from app.domain.extraction import BriefExtractionOutput, BriefRequirementCandidate
from app.domain.requirements import RequirementType
from app.integrations.llm.exceptions import LLMOutputValidationError
from app.services.brief_extraction import BriefExtractionService, BriefInputError


class FakeProvider:
    provider_name = "test-provider"
    model_name = "test-model"

    def __init__(self, output: object) -> None:
        self.output = output
        self.received_brief: str | None = None

    async def extract_structured_requirements(
        self,
        brief: str,
    ) -> BriefExtractionOutput:
        self.received_brief = brief
        return self.output  # type: ignore[return-value]


def candidate(
    rule_type: RequirementType = RequirementType.REQUIRED_MENTION,
    *,
    description: str = "Mention AcmeVPN",
    value: str = "AcmeVPN",
    before_seconds: float | None = None,
    source_text: str = "Please mention AcmeVPN.",
) -> BriefRequirementCandidate:
    return BriefRequirementCandidate(
        type=rule_type,
        description=description,
        value=value,
        before_seconds=before_seconds,
        source_text=source_text,
    )


def output(*requirements: BriefRequirementCandidate) -> BriefExtractionOutput:
    return BriefExtractionOutput(requirements=requirements)


def run_extract(
    provider: FakeProvider,
    *,
    brief: str = "Please mention AcmeVPN.",
    ids: Iterator[str] | None = None,
):
    factory = (lambda: next(ids)) if ids is not None else (lambda: "req_ai_test")
    return asyncio.run(BriefExtractionService(provider, id_factory=factory).extract(brief))


def test_valid_simple_extraction_maps_to_domain_requirement() -> None:
    provider = FakeProvider(output(candidate()))

    report = run_extract(provider)

    extracted = report.requirements[0]
    assert extracted.requirement.model_dump(mode="json") == {
        "id": "req_ai_test",
        "type": "required_mention",
        "description": "Mention AcmeVPN",
        "value": "AcmeVPN",
    }
    assert report.provider == "test-provider"
    assert report.model == "test-model"
    assert report.prompt_version == "2.0"


def test_multiple_supported_rule_types_preserve_provider_order() -> None:
    provider = FakeProvider(
        output(
            candidate(),
            candidate(
                RequirementType.REQUIRED_EXACT_TOKEN,
                description="Use the creator code",
                value="CREATOR25",
                source_text="Use code CREATOR25.",
            ),
            candidate(
                RequirementType.FORBIDDEN_PHRASE,
                description="Avoid an anonymity guarantee",
                value="guaranteed anonymity",
                source_text="Do not claim guaranteed anonymity.",
            ),
            candidate(
                RequirementType.REQUIRED_MENTION_BEFORE,
                description="Mention AcmeVPN in the first minute",
                before_seconds=60,
                source_text="Mention AcmeVPN in the first 60 seconds.",
            ),
            candidate(
                RequirementType.REQUIRED_URL,
                description="Mention the campaign URL",
                value="https://www.acmevpn.com/creator/",
                source_text="Tell viewers to visit acmevpn.com/creator.",
            ),
            candidate(
                RequirementType.REQUIRED_TALKING_POINT,
                description="Explain the editing-time benefit",
                value="The product reduces editing time",
                source_text="Explain that the product helps reduce editing time.",
            ),
            candidate(
                RequirementType.FORBIDDEN_CLAIM,
                description="Avoid an untraceability claim",
                value="The service makes users completely untraceable",
                source_text="Do not claim users become completely untraceable.",
            ),
        )
    )

    report = run_extract(provider, ids=iter(f"req_ai_{i}" for i in range(7)))

    assert [item.requirement.type for item in report.requirements] == list(
        RequirementType
    )
    assert report.requirements[3].requirement.before_seconds == 60
    assert report.requirements[4].requirement.value == "acmevpn.com/creator"


def test_semantic_extraction_maps_talking_point_and_forbidden_claim_with_provenance() -> None:
    provider = FakeProvider(
        output(
            candidate(
                RequirementType.REQUIRED_TALKING_POINT,
                description="Explain the editing-time benefit",
                value="The product reduces editing time",
                source_text="Tell viewers the product can reduce editing time.",
            ),
            candidate(
                RequirementType.FORBIDDEN_CLAIM,
                description="Avoid an absolute anonymity claim",
                value="The VPN makes users completely untraceable",
                source_text="Do not claim the VPN makes users completely untraceable.",
            ),
        )
    )

    report = run_extract(provider, ids=iter(["req_ai_talking", "req_ai_claim"]))

    assert [item.requirement.type for item in report.requirements] == [
        RequirementType.REQUIRED_TALKING_POINT,
        RequirementType.FORBIDDEN_CLAIM,
    ]
    assert report.requirements[0].source_text == (
        "Tell viewers the product can reduce editing time."
    )
    assert report.requirements[1].source_text == (
        "Do not claim the VPN makes users completely untraceable."
    )


def test_exact_coupon_and_quoted_forbidden_phrase_remain_deterministic() -> None:
    provider = FakeProvider(
        output(
            candidate(
                RequirementType.REQUIRED_EXACT_TOKEN,
                description="Use the exact coupon",
                value="CREATOR25",
                source_text="Use code CREATOR25.",
            ),
            candidate(
                RequirementType.FORBIDDEN_PHRASE,
                description="Do not use the quoted phrase",
                value="guaranteed anonymity",
                source_text='Do not say the phrase "guaranteed anonymity".',
            ),
        )
    )

    report = run_extract(provider, ids=iter(["req_ai_code", "req_ai_phrase"]))

    assert [item.requirement.type for item in report.requirements] == [
        RequirementType.REQUIRED_EXACT_TOKEN,
        RequirementType.FORBIDDEN_PHRASE,
    ]


def test_explicit_url_extraction_preserves_source_provenance() -> None:
    provider = FakeProvider(
        output(
            candidate(
                RequirementType.REQUIRED_URL,
                description="Mention the campaign URL",
                value="https://www.acmevpn.com/creator/",
                source_text="Tell viewers to visit acmevpn.com/creator.",
            )
        )
    )

    extracted = run_extract(provider).requirements[0]

    assert extracted.requirement.type is RequirementType.REQUIRED_URL
    assert extracted.requirement.value == "acmevpn.com/creator"
    assert extracted.source_text == "Tell viewers to visit acmevpn.com/creator."


def test_coupon_remains_exact_token_and_no_url_is_added() -> None:
    provider = FakeProvider(
        output(
            candidate(
                RequirementType.REQUIRED_EXACT_TOKEN,
                description="Use the creator code",
                value="CREATOR25",
                source_text="Use code CREATOR25.",
            )
        )
    )

    report = run_extract(provider)

    assert len(report.requirements) == 1
    assert report.requirements[0].requirement.type is RequirementType.REQUIRED_EXACT_TOKEN
    assert report.requirements[0].requirement.value == "CREATOR25"


def test_exact_coupon_and_source_provenance_are_preserved() -> None:
    provider = FakeProvider(
        output(
            candidate(
                RequirementType.REQUIRED_EXACT_TOKEN,
                description="Use the exact checkout code",
                value="CrEaToR-25",
                source_text="Your exact checkout code is CrEaToR-25.",
            )
        )
    )

    result = run_extract(provider).requirements[0]

    assert result.requirement.value == "CrEaToR-25"
    assert result.source_text == "Your exact checkout code is CrEaToR-25."


def test_original_brief_formatting_is_sent_to_provider() -> None:
    brief = "Campaign title\n\nMention AcmeVPN within 60 seconds."
    provider = FakeProvider(output(candidate()))

    run_extract(provider, brief=brief)

    assert provider.received_brief == brief


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (
            {
                "type": "semantic_claim",
                "description": "Check a claim",
                "value": "safe",
                "before_seconds": None,
                "source_text": "It is safe.",
            },
            "type",
        ),
        (
            {
                "type": RequirementType.REQUIRED_MENTION,
                "description": "Mention brand",
                "value": "   ",
                "before_seconds": None,
                "source_text": "Mention the brand.",
            },
            "value",
        ),
        (
            {
                "type": RequirementType.REQUIRED_MENTION_BEFORE,
                "description": "Mention early",
                "value": "AcmeVPN",
                "before_seconds": -1,
                "source_text": "Mention AcmeVPN early.",
            },
            "before_seconds",
        ),
        (
            {
                "type": RequirementType.REQUIRED_MENTION,
                "description": "Mention brand",
                "value": "AcmeVPN",
                "before_seconds": None,
                "source_text": "Mention the brand.",
                "unsupported": True,
            },
            "unsupported",
        ),
    ],
)
def test_invalid_structured_candidates_are_rejected(
    payload: dict[str, object],
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        BriefRequirementCandidate.model_validate(payload)


def test_timed_requirement_requires_timing_value() -> None:
    with pytest.raises(ValidationError, match="require before_seconds"):
        candidate(RequirementType.REQUIRED_MENTION_BEFORE)


def test_non_timed_requirement_rejects_timing_value() -> None:
    with pytest.raises(ValidationError, match="only supported for timed"):
        candidate(before_seconds=60)


@pytest.mark.parametrize("brief", ["", "  \n\t  "])
def test_service_rejects_empty_brief_without_calling_provider(brief: str) -> None:
    provider = FakeProvider(output(candidate()))

    with pytest.raises(BriefInputError, match="blank"):
        run_extract(provider, brief=brief)

    assert provider.received_brief is None


def test_service_revalidates_untrusted_provider_boundary() -> None:
    provider = FakeProvider({"requirements": "not-a-list"})

    with pytest.raises(LLMOutputValidationError):
        run_extract(provider)


def test_ids_are_generated_by_sponsorguard_and_not_provider_output() -> None:
    provider = FakeProvider(output(candidate(), candidate(value="Twenty-five percent")))

    report = run_extract(provider, ids=iter(["req_ai_one", "req_ai_two"]))

    assert [item.requirement.id for item in report.requirements] == [
        "req_ai_one",
        "req_ai_two",
    ]


def test_id_allocation_retries_collisions() -> None:
    provider = FakeProvider(output(candidate(), candidate(value="25% discount")))

    report = run_extract(
        provider,
        ids=iter(["req_ai_same", "req_ai_same", "req_ai_unique"]),
    )

    assert [item.requirement.id for item in report.requirements] == [
        "req_ai_same",
        "req_ai_unique",
    ]
