from pathlib import Path

import pytest

from app.domain.compliance import ComplianceReasonCode, ComplianceStatus
from app.domain.requirements import (
    ForbiddenPhraseRequirement,
    RequiredExactTokenRequirement,
    RequiredMentionBeforeRequirement,
    RequiredMentionRequirement,
)
from app.domain.transcript import TranscriptSegment
from app.parsers.srt import parse_srt
from app.services.compliance_engine import (
    ComplianceInputError,
    ComplianceInputErrorCode,
    evaluate_compliance,
)


FIXTURES = Path(__file__).parent / "fixtures"


def segment(index: int, start: float, text: str) -> TranscriptSegment:
    return TranscriptSegment(
        index=index,
        start_seconds=start,
        end_seconds=start + 2,
        text=text,
    )


def required_mention(
    value: str = "AcmeVPN",
    *,
    requirement_id: str = "req_brand",
) -> RequiredMentionRequirement:
    return RequiredMentionRequirement(
        id=requirement_id,
        description=f"Mention {value}",
        value=value,
    )


def test_required_mention_returns_exact_evidence() -> None:
    transcript = [
        segment(7, 38, "Today's video is sponsored by AcmeVPN."),
    ]

    result = evaluate_compliance([required_mention()], transcript).results[0]

    assert result.model_dump(mode="json") == {
        "requirement_id": "req_brand",
        "status": "pass",
        "reason_code": "REQUIRED_MENTION_FOUND",
        "reason": 'Required mention "AcmeVPN" was found.',
        "segment_index": 7,
        "timestamp_seconds": 38.0,
        "evidence": "Today's video is sponsored by AcmeVPN.",
    }


def test_required_mention_is_case_insensitive_and_punctuation_tolerant() -> None:
    transcript = [segment(1, 4, "Our sponsor is (ACMEVPN).")]

    result = evaluate_compliance([required_mention()], transcript).results[0]

    assert result.status is ComplianceStatus.PASS
    assert result.evidence == "Our sponsor is (ACMEVPN)."


def test_required_mention_does_not_match_inside_larger_word() -> None:
    transcript = [segment(1, 4, "Try MyAcmeVPNPlus today.")]

    result = evaluate_compliance([required_mention()], transcript).results[0]

    assert result.model_dump(mode="json") == {
        "requirement_id": "req_brand",
        "status": "fail",
        "reason_code": "REQUIRED_MENTION_MISSING",
        "reason": 'Required mention "AcmeVPN" was not found.',
        "segment_index": None,
        "timestamp_seconds": None,
        "evidence": None,
    }


def test_required_mention_returns_earliest_matching_segment() -> None:
    transcript = [
        segment(8, 12, "AcmeVPN first mention."),
        segment(3, 22, "AcmeVPN second mention."),
    ]

    result = evaluate_compliance([required_mention()], transcript).results[0]

    assert result.segment_index == 8
    assert result.timestamp_seconds == 12.0
    assert result.evidence == "AcmeVPN first mention."


@pytest.mark.parametrize("text", ["Use CREATOR25.", "use creator25 at checkout."])
def test_required_exact_token_matches_case_insensitively(text: str) -> None:
    requirement = RequiredExactTokenRequirement(
        id="req_coupon",
        description="Say the creator code",
        value="CREATOR25",
    )

    result = evaluate_compliance([requirement], [segment(1, 10, text)]).results[0]

    assert result.status is ComplianceStatus.PASS
    assert result.reason_code is ComplianceReasonCode.REQUIRED_TOKEN_FOUND
    assert result.evidence == text


def test_hyphenated_exact_token_matches_literally() -> None:
    requirement = RequiredExactTokenRequirement(
        id="req_coupon",
        description="Say the creator code",
        value="ABC-123",
    )

    result = evaluate_compliance(
        [requirement],
        [segment(1, 10, "Use code ABC-123 at checkout.")],
    ).results[0]

    assert result.reason_code is ComplianceReasonCode.REQUIRED_TOKEN_FOUND


def test_required_exact_token_rejects_accidental_substring() -> None:
    requirement = RequiredExactTokenRequirement(
        id="req_coupon",
        description="Say the creator code",
        value="CREATOR25",
    )

    result = evaluate_compliance(
        [requirement],
        [segment(1, 10, "Use MYCREATOR25PLUS at checkout.")],
    ).results[0]

    assert result.model_dump(mode="json") == {
        "requirement_id": "req_coupon",
        "status": "fail",
        "reason_code": "REQUIRED_TOKEN_MISSING",
        "reason": 'Required token "CREATOR25" was not found.',
        "segment_index": None,
        "timestamp_seconds": None,
        "evidence": None,
    }


def test_timing_requirement_passes_before_deadline() -> None:
    requirement = RequiredMentionBeforeRequirement(
        id="req_brand_timing",
        description="Mention AcmeVPN before 00:30",
        value="AcmeVPN",
        before_seconds=30,
    )

    result = evaluate_compliance(
        [requirement],
        [segment(1, 22, "Sponsored by AcmeVPN.")],
    ).results[0]

    assert result.status is ComplianceStatus.PASS
    assert result.reason_code is ComplianceReasonCode.REQUIRED_MENTION_WITHIN_DEADLINE
    assert result.timestamp_seconds == 22.0
    assert result.reason == (
        'Required mention "AcmeVPN" was found at 00:22, within the 00:30 deadline.'
    )


def test_timing_requirement_passes_at_exact_boundary() -> None:
    requirement = RequiredMentionBeforeRequirement(
        id="req_brand_timing",
        description="Mention AcmeVPN before 00:30",
        value="AcmeVPN",
        before_seconds=30,
    )

    result = evaluate_compliance(
        [requirement],
        [segment(1, 30, "Sponsored by AcmeVPN.")],
    ).results[0]

    assert result.status is ComplianceStatus.PASS
    assert result.reason_code is ComplianceReasonCode.REQUIRED_MENTION_WITHIN_DEADLINE
    assert result.timestamp_seconds == 30.0


def test_timing_requirement_distinguishes_late_mention() -> None:
    requirement = RequiredMentionBeforeRequirement(
        id="req_brand_timing",
        description="Mention AcmeVPN before 00:30",
        value="AcmeVPN",
        before_seconds=30,
    )

    result = evaluate_compliance(
        [requirement],
        [segment(4, 38, "Today's video is sponsored by AcmeVPN.")],
    ).results[0]

    assert result.model_dump(mode="json") == {
        "requirement_id": "req_brand_timing",
        "status": "fail",
        "reason_code": "REQUIRED_MENTION_TOO_LATE",
        "reason": (
            'Required mention "AcmeVPN" was found at 00:38, '
            "8 seconds after the allowed deadline."
        ),
        "segment_index": 4,
        "timestamp_seconds": 38.0,
        "evidence": "Today's video is sponsored by AcmeVPN.",
    }


def test_timing_requirement_distinguishes_missing_mention() -> None:
    requirement = RequiredMentionBeforeRequirement(
        id="req_brand_timing",
        description="Mention AcmeVPN before 00:30",
        value="AcmeVPN",
        before_seconds=30,
    )

    result = evaluate_compliance(
        [requirement],
        [segment(1, 2, "Welcome to the video.")],
    ).results[0]

    assert result.reason_code is ComplianceReasonCode.REQUIRED_MENTION_MISSING
    assert result.timestamp_seconds is None
    assert result.evidence is None


def test_forbidden_phrase_absent_passes_without_evidence() -> None:
    requirement = ForbiddenPhraseRequirement(
        id="req_forbidden",
        description="Avoid unsupported privacy claim",
        value="guaranteed anonymity",
    )

    result = evaluate_compliance(
        [requirement],
        [segment(1, 5, "AcmeVPN helps protect your connection.")],
    ).results[0]

    assert result.model_dump(mode="json") == {
        "requirement_id": "req_forbidden",
        "status": "pass",
        "reason_code": "FORBIDDEN_PHRASE_ABSENT",
        "reason": 'Forbidden phrase "guaranteed anonymity" was not found.',
        "segment_index": None,
        "timestamp_seconds": None,
        "evidence": None,
    }


def test_forbidden_phrase_found_fails_with_earliest_evidence() -> None:
    requirement = ForbiddenPhraseRequirement(
        id="req_forbidden",
        description="Avoid unsupported privacy claim",
        value="guaranteed anonymity",
    )
    transcript = [
        segment(2, 12, "AcmeVPN offers guaranteed anonymity online."),
        segment(3, 18, "Guaranteed anonymity for everyone."),
    ]

    result = evaluate_compliance([requirement], transcript).results[0]

    assert result.status is ComplianceStatus.FAIL
    assert result.reason_code is ComplianceReasonCode.FORBIDDEN_PHRASE_FOUND
    assert result.segment_index == 2
    assert result.timestamp_seconds == 12.0
    assert result.evidence == "AcmeVPN offers guaranteed anonymity online."


def test_results_preserve_requirement_order_and_summary_is_exact() -> None:
    requirements = [
        required_mention(requirement_id="req_brand"),
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
    ]
    transcript = [segment(1, 5, "AcmeVPN offers guaranteed anonymity online.")]

    report = evaluate_compliance(requirements, transcript)

    assert [result.requirement_id for result in report.results] == [
        "req_brand",
        "req_coupon",
        "req_forbidden",
    ]
    assert report.summary.model_dump() == {
        "total": 3,
        "passed": 1,
        "warnings": 0,
        "failed": 2,
        "compliance_score": 33.33,
    }


def test_engine_integrates_with_parsed_srt_fixture() -> None:
    content = (FIXTURES / "acme_vpn.srt").read_text(encoding="utf-8")
    transcript = parse_srt(content)
    requirements = [
        required_mention(),
        RequiredMentionBeforeRequirement(
            id="req_brand_timing",
            description="Mention AcmeVPN before 01:00",
            value="AcmeVPN",
            before_seconds=60,
        ),
    ]

    report = evaluate_compliance(requirements, transcript)

    assert [result.status for result in report.results] == [
        ComplianceStatus.PASS,
        ComplianceStatus.PASS,
    ]
    assert [result.timestamp_seconds for result in report.results] == [38.0, 38.0]
    assert report.summary.compliance_score == 100.0


def test_rejects_duplicate_requirement_ids() -> None:
    requirements = [
        required_mention(requirement_id="req_duplicate"),
        required_mention(value="OtherVPN", requirement_id="req_duplicate"),
    ]

    with pytest.raises(ComplianceInputError) as error:
        evaluate_compliance(requirements, [segment(1, 0, "AcmeVPN.")])

    assert error.value.code is ComplianceInputErrorCode.DUPLICATE_REQUIREMENT_ID
    assert str(error.value) == (
        'Duplicate requirement ID "req_duplicate" at positions 0 and 1.'
    )


def test_rejects_empty_requirement_collection() -> None:
    with pytest.raises(ComplianceInputError) as error:
        evaluate_compliance([], [segment(1, 0, "AcmeVPN.")])

    assert error.value.code is ComplianceInputErrorCode.EMPTY_REQUIREMENTS


def test_rejects_empty_transcript_collection() -> None:
    with pytest.raises(ComplianceInputError) as error:
        evaluate_compliance([required_mention()], [])

    assert error.value.code is ComplianceInputErrorCode.EMPTY_TRANSCRIPT


@pytest.mark.parametrize("invalid", [None, "requirements", b"requirements"])
def test_rejects_invalid_requirement_collection(invalid: object) -> None:
    with pytest.raises(ComplianceInputError) as error:
        evaluate_compliance(  # type: ignore[arg-type]
            invalid,
            [segment(1, 0, "AcmeVPN.")],
        )

    assert error.value.code is ComplianceInputErrorCode.INVALID_REQUIREMENT_COLLECTION


@pytest.mark.parametrize("invalid", [None, "transcript", b"transcript"])
def test_rejects_invalid_transcript_collection(invalid: object) -> None:
    with pytest.raises(ComplianceInputError) as error:
        evaluate_compliance(  # type: ignore[arg-type]
            [required_mention()],
            invalid,
        )

    assert error.value.code is ComplianceInputErrorCode.INVALID_TRANSCRIPT_COLLECTION


def test_rejects_unvalidated_requirement_item() -> None:
    with pytest.raises(ComplianceInputError) as error:
        evaluate_compliance(  # type: ignore[list-item]
            [{"id": "req_brand"}],
            [segment(1, 0, "AcmeVPN.")],
        )

    assert error.value.code is ComplianceInputErrorCode.INVALID_REQUIREMENT


def test_rejects_unvalidated_transcript_item() -> None:
    with pytest.raises(ComplianceInputError) as error:
        evaluate_compliance(  # type: ignore[list-item]
            [required_mention()],
            [{"index": 1}],
        )

    assert error.value.code is ComplianceInputErrorCode.INVALID_TRANSCRIPT_SEGMENT
