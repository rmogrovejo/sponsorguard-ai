import asyncio

import pytest

from app.domain.shortform import PreflightStatus, ShortFormPlatform
from app.domain.shortform_suggestions import SuggestionType
from app.services.shortform_suggestions import (
    SuggestionInputError,
    SuggestionInputErrorCode,
    generate_shortform_suggestion,
    is_suggestion_eligible,
    require_suggestion_eligibility,
)
from tests.shortform_suggestion_fixtures import (
    FakeSuggestionGenerator,
    OPENING_SEGMENTS,
    cta_finding,
    opening_finding,
    provider_output,
)


@pytest.mark.parametrize(
    ("finding", "expected"),
    [
        (opening_finding(status=PreflightStatus.PASS, evidence="Clear subject."), False),
        (opening_finding(status=PreflightStatus.WARNING), True),
        (opening_finding(status=PreflightStatus.NOT_EVALUATED, evidence=None, start=0.0), False),
        (cta_finding(status=PreflightStatus.PASS, evidence="Follow for part two."), False),
        (cta_finding(status=PreflightStatus.WARNING), True),
        (cta_finding(status=PreflightStatus.NOT_EVALUATED), False),
    ],
)
def test_suggestion_eligibility_matches_finding_status(finding, expected) -> None:
    assert is_suggestion_eligible(finding) is expected
    finding_id = SuggestionType(finding.check_id)
    if expected:
        assert require_suggestion_eligibility(finding, finding_id=finding_id) is finding_id
        return
    with pytest.raises(SuggestionInputError) as error:
        require_suggestion_eligibility(finding, finding_id=finding_id)
    assert error.value.code is SuggestionInputErrorCode.INELIGIBLE_FINDING


def test_ineligible_opening_does_not_call_provider() -> None:
    provider = FakeSuggestionGenerator(provider_output())
    with pytest.raises(SuggestionInputError):
        asyncio.run(
            generate_shortform_suggestion(
                opening_finding(status=PreflightStatus.PASS, evidence="Clear subject."),
                OPENING_SEGMENTS,
                finding_id=SuggestionType.OPENING,
                platform=ShortFormPlatform.TIKTOK,
                video_duration_seconds=30.0,
                provider=provider,
            )
        )
    assert provider.calls == 0
