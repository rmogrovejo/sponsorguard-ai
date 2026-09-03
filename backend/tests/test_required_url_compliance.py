from app.domain.compliance import ComplianceReasonCode, ComplianceStatus
from app.domain.requirements import (
    RequiredMentionRequirement,
    RequiredURLRequirement,
)
from app.domain.transcript import TranscriptSegment
from app.services.compliance_engine import evaluate_compliance


def segment(index: int, start: float, text: str) -> TranscriptSegment:
    return TranscriptSegment(
        index=index,
        start_seconds=start,
        end_seconds=start + 4,
        text=text,
    )


def required_url(
    requirement_id: str = "req_campaign_url",
    value: str = "acmevpn.com/creator",
) -> RequiredURLRequirement:
    return RequiredURLRequirement(
        id=requirement_id,
        description="Mention campaign URL",
        value=value,
    )


def test_required_url_pass_returns_exact_timestamp_and_original_evidence() -> None:
    original = "Go to https://www.acmevpn.com/creator/ for the offer."

    result = evaluate_compliance(
        [required_url()],
        [segment(12, 48.25, original)],
    ).results[0]

    assert result.model_dump(mode="json") == {
        "requirement_id": "req_campaign_url",
        "status": "pass",
        "reason_code": "REQUIRED_URL_FOUND",
        "reason": 'Required URL "acmevpn.com/creator" was found.',
        "segment_index": 12,
        "timestamp_seconds": 48.25,
        "evidence": original,
    }


def test_required_url_fail_does_not_fabricate_evidence() -> None:
    result = evaluate_compliance(
        [required_url()],
        [segment(1, 2, "Visit acmevpn.com/other.")],
    ).results[0]

    assert result.status is ComplianceStatus.FAIL
    assert result.reason_code is ComplianceReasonCode.REQUIRED_URL_MISSING
    assert result.segment_index is None
    assert result.timestamp_seconds is None
    assert result.evidence is None


def test_mixed_campaign_preserves_order_and_scores_url_normally() -> None:
    requirements = [
        required_url(),
        RequiredMentionRequirement(
            id="req_brand",
            description="Mention AcmeVPN",
            value="AcmeVPN",
        ),
        required_url("req_second_url", "acmevpn.com/partner"),
    ]
    transcript = [
        segment(1, 3, "AcmeVPN is sponsoring this video."),
        segment(2, 8, "Visit https://www.acmevpn.com/creator/ today."),
    ]

    report = evaluate_compliance(requirements, transcript)

    assert [result.requirement_id for result in report.results] == [
        "req_campaign_url",
        "req_brand",
        "req_second_url",
    ]
    assert [result.status for result in report.results] == [
        ComplianceStatus.PASS,
        ComplianceStatus.PASS,
        ComplianceStatus.FAIL,
    ]
    assert report.summary.model_dump(mode="json") == {
        "total": 3,
        "evaluated": 3,
        "not_evaluated": 0,
        "passed": 2,
        "warnings": 0,
        "failed": 1,
        "compliance_score": 66.67,
        "verification_coverage": 100.0,
    }
